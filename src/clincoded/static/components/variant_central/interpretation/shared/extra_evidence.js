'use strict';
// Third-party libs
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import createReactClass from 'create-react-class';
import _ from 'underscore';
import moment from 'moment';
import { Form, FormMixin, Input } from '../../../../libs/bootstrap/form';

// Internal libs
import { RestMixin } from '../../../rest';
import { AddResourceId } from '../../../add_external_resource';
import { getAffiliationName } from '../../../../libs/get_affiliation_name';
import { extraEvidenceHasSource } from '../../../../libs/extra_evidence_version';
import { ConfirmDelete } from './confirm_delete';
import { EvidenceModalManager } from '../segregation/evidenceModalManager';

var curator = require('../../../curator');
var PmidSummary = curator.PmidSummary;
var CuratorHistory = require('../../../curator_history');

// Class to render the extra evidence table in VCI, and handle any interactions with it
var ExtraEvidenceTable = module.exports.ExtraEvidenceTable = createReactClass({
    mixins: [RestMixin, FormMixin, CuratorHistory],

    propTypes: {
        viewOnly: PropTypes.bool, // True if extra evidence is in view-only mode
        tableName: PropTypes.object, // table name as HTML object
        category: PropTypes.string, // category (usually the tab) the evidence is part of
        subcategory: PropTypes.string, // subcategory (usually the panel) the evidence is part of
        href_url: PropTypes.object, // href_url object
        session: PropTypes.object, // session object
        variant: PropTypes.object, // parent variant object
        interpretation: PropTypes.object, // parent interpretation object
        updateInterpretationObj: PropTypes.func, // function from index.js; this function will pass the updated interpretation object back to index.js
        affiliation: PropTypes.object, // user's affiliation data object
        criteriaList: PropTypes.array, // criteria code(s) pertinent to the category/subcategory
        evidenceCollectionDone: PropTypes.func,  // function to call to add or edit an existing one
        canCurrUserModifyEvidence: PropTypes.func, // function to check if current logged in user can modify given evidence
        isBusy: PropTypes.bool, // True if backend is busy
        setBusy: PropTypes.func // function to set case segregation page edit state
    },

    contextTypes: {
        fetch: PropTypes.func // Function to perform a search
    },

    getInitialState: function() {
        return {
            submitBusy: false, // spinner for Save button
            editBusy: false, // spinner for Edit button
            deleteBusy: false, // spinner for Delete button
            updateMsg: null,
            tempEvidence: null, // evidence object brought in my AddResourceId modal
            editEvidenceId: null, // the ID of the evidence to be edited from the table
            descriptionInput: null, // state to store the description input content
            editDescriptionInput: null, // state to store the edit description input content
            criteriaInput: 'none', // state to store one or more selected criteria
            editCriteriaInput: 'none', // state to store one or more edited criteria
            variant: this.props.variant, // parent variant object
            interpretation: this.props.interpretation ? this.props.interpretation : null, // parent interpretation object
            criteriaList: this.props.criteriaList ? this.props.criteriaList : [],
            deleteOnly: this.props.deleteOnly ? this.props.deleteOnly : false
        };
    },

    componentWillReceiveProps: function(nextProps) {
        // Update variant object when received
        if (nextProps.variant) {
            this.setState({variant: nextProps.variant});
        }
        // Update interpretation object when received
        if (nextProps.interpretation) {
            this.setState({interpretation: nextProps.interpretation});
        }
        // Update criteria list specific to the PMID
        if (nextProps.criteriaList) {
            this.setState({criteriaList: nextProps.criteriaList});
        }
    },

    updateTempEvidence: function(article) {
        // Called by AddResourceId modal upon closing modal. Updates the tempEvidence state and clears description input
        this.setState({tempEvidence: article, editCriteriaSelection: 'none', descriptionInput: null});
    },

    submitForm: function(e) {
        // Called when Add PMID form is submitted
        e.preventDefault(); e.stopPropagation(); // Don't run through HTML submit handler
        this.setState({submitBusy: true, updateMsg: null}); // Save button pressed; disable it and start spinner

        // Save all form values from the DOM.
        this.saveAllFormValues();

        let flatInterpretation = null;
        let freshInterpretation = null;

        this.getRestData('/interpretation/' + this.state.interpretation.uuid).then(interpretation => {
            // get updated interpretation object, then flatten it
            freshInterpretation = interpretation;
            flatInterpretation = curator.flatten(freshInterpretation);

            // create extra_evidence object to be inserted
            let extra_evidence = {
                variant: this.state.interpretation.variant['@id'],
                category: this.props.category,
                subcategory: this.props.subcategory,
                articles: [this.state.tempEvidence.pmid],
                evidenceCriteria: this.state.criteriaInput,
                evidenceDescription: this.refs['description'].getValue()
            };

            // Add affiliation if the user is associated with an affiliation
            // and if the data object has no affiliation
            if (this.props.affiliation && Object.keys(this.props.affiliation).length) {
                if (!extra_evidence.affiliation) {
                    extra_evidence.affiliation = this.props.affiliation.affiliation_id;
                }
            }

            return this.postRestData('/extra-evidence/', extra_evidence).then(result => {
                // post the new extra evidence object, then add its @id to the interpretation's extra_evidence_list array
                if (!flatInterpretation.extra_evidence_list) {
                    flatInterpretation.extra_evidence_list = [];
                }
                flatInterpretation.extra_evidence_list.push(result['@graph'][0]['@id']);

                // update interpretation object
                return this.recordHistory('add-hide', result['@graph'][0]).then(addHistory => {
                    return this.putRestData('/interpretation/' + this.state.interpretation.uuid, flatInterpretation).then(data => {
                        return this.recordHistory('modify-hide', data['@graph'][0]).then(editHistory => {
                            return Promise.resolve(data['@graph'][0]);
                        });

                    });
                });

            });
        }).then(interpretation => {
            // upon successful save, set everything to default state, and trigger updateInterptationObj callback
            this.setState({submitBusy: false, tempEvidence: null, editCriteriaSelection: 'none', descriptionInput: null});
            this.props.updateInterpretationObj();
        }).catch(error => {
            this.setState({submitBusy: false, tempEvidence: null, updateMsg: <span className="text-danger">Something went wrong while trying to save this evidence!</span>});
            console.log(error);
        });
    },

    cancelAddEvidenceButton: function(e) {
        // called when the Cancel button is pressed during Add PMID
        e.preventDefault(); e.stopPropagation(); // Don't run through HTML submit handler
        this.setState({tempEvidence: null, editCriteriaSelection: 'none', descriptionInput: null});
    },

    editEvidenceButton: function(id) {
        // called when the Edit button is pressed for an existing evidence
        this.setState({editEvidenceId: id, editCriteriaSelection: 'none', editDescriptionInput: null});
    },

    cancelEditEvidenceButton: function(e) {
        // called when the Cancel button is pressed while editing an existing evidence
        e.preventDefault(); e.stopPropagation(); // Don't run through HTML submit handler
        this.setState({editEvidenceId: null, editCriteriaSelection: 'none', editDescriptionInput: null});
    },

    submitEditForm: function(e) {
        // called when Edit PMID form is submitted
        e.preventDefault(); e.stopPropagation(); // Don't run through HTML submit handler
        this.setState({editBusy: true, updateMsg: null}); // Save button pressed; disable it and start spinner

        // Save all form values from the DOM.
        this.saveAllFormValues();

        // since the extra_evidence object is really simple, and the description is the only thing changing,
        // make a new one instead of getting an updated and flattened one
        let extra_evidence = {
            variant: this.state.interpretation.variant['@id'],
            category: this.props.category,
            subcategory: this.props.subcategory,
            articles: [this.refs['edit-pmid'].getValue()],
            evidenceCriteria: this.state.editCriteriaInput,
            evidenceDescription: this.refs['edit-description'].getValue()
        };

        // Add affiliation if the user is associated with an affiliation
        // and if the data object has no affiliation
        if (this.props.affiliation && Object.keys(this.props.affiliation).length) {
            if (!extra_evidence.affiliation) {
                extra_evidence.affiliation = this.props.affiliation.affiliation_id;
            }
        }

        this.putRestData(this.refs['edit-target'].getValue(), extra_evidence).then(result => {
            this.recordHistory('modify-hide', result['@graph'][0]).then(addHistory => {
                // upon successful save, set everything to default state, and trigger updateInterptationObj callback
                this.setState({editBusy: false, editEvidenceId: null, editCriteriaSelection: 'none', editDescriptionInput: null});
                this.props.updateInterpretationObj();
            });
        }).catch(error => {
            this.setState({editBusy: false, editEvidenceId: null, editCriteriaSelection: 'none', editDescriptionInput: null});
            console.log(error);
        });
    },

    deleteEvidence: function(evidence) {
        // called when the Delete button for an existing evidence is pressed
        this.setState({deleteBusy: true});

        let deleteTargetId = evidence['@id'];
        let flatInterpretation = null;
        let freshInterpretation = null;

        // since the extra_evidence object is really simple, and the description is the only thing changing,
        // make a new one instead of getting an updated and flattened one
        let extra_evidence = {
            variant: evidence.variant,
            category: this.props.category,
            subcategory: this.props.subcategory,
            articles: [evidence.articles[0]['@id']],
            evidenceCriteria: evidence.evidenceCriteria,
            evidenceDescription: evidence.evidenceDescription,
            status: 'deleted'
        };

        this.putRestData(evidence['@id'] + '?render=false', extra_evidence).then(result => {
            return this.recordHistory('delete-hide', result['@graph'][0]).then(deleteHistory => {
                return this.getRestData('/interpretation/' + this.state.interpretation.uuid).then(interpretation => {
                    // get updated interpretation object, then flatten it
                    freshInterpretation = interpretation;
                    flatInterpretation = curator.flatten(freshInterpretation);

                    // remove removed evidence from evidence list
                    flatInterpretation.extra_evidence_list.splice(flatInterpretation.extra_evidence_list.indexOf(deleteTargetId), 1);

                    // update the interpretation object
                    return this.putRestData('/interpretation/' + this.state.interpretation.uuid, flatInterpretation).then(data => {
                        return this.recordHistory('modify-hide', data['@graph'][0]).then(editHistory => {
                            return Promise.resolve(data['@graph'][0]);
                        });
                    });
                });
            }).then(interpretation => {
                // upon successful save, set everything to default state, and trigger updateInterptationObj callback
                this.setState({deleteBusy: false});
                this.props.updateInterpretationObj();
            });
        }).catch(error => {
            this.setState({deleteBusy: false});
            console.log(error);
        });
    },

    // Return the "Add in New Format" button for case segregation old format evidences
    getAddNewEvidenceButton: function(extra_evidence) {
        let data = {};
        let isNew = false;
        const pmid = extra_evidence.articles && extra_evidence.articles.length > 0 ? extra_evidence.articles[0].pmid : '';
        // Get extra evidences in new format for this interpretation
        let extraEvidenceData = [];
        if (this.state.interpretation != null && 'extra_evidence_list' in this.state.interpretation) {
            if (this.state.interpretation.extra_evidence_list) {
                this.state.interpretation.extra_evidence_list.forEach(extra_evidence => {
                    if (extra_evidence.category === 'case-segregation' &&
                        extraEvidenceHasSource(extra_evidence)) {
                        extraEvidenceData.push(extra_evidence);
                    }
                });
            }
        }

        // Check if pmid/article already exists in current case segregation evidences
        let candidates = extraEvidenceData
            .filter(o => 'pmid' in o.sourceInfo.metadata
                    && o.sourceInfo.metadata['pmid'] === pmid);
        let foundCandidate = null;
        if (candidates.length > 0) {
            candidates.forEach(candidate => {
                if (this.props.canCurrUserModifyEvidence(candidate)) {
                    foundCandidate = candidate;
                }
            });
        }
        // If already exists, add old evidence comment to it and allow user to edit the evidence
        if (foundCandidate != null) {
            // deep copy the evidence data
            data = JSON.parse(JSON.stringify(foundCandidate));
            data.sourceInfo.data['comments'] = (foundCandidate.sourceInfo.data['comments'] && foundCandidate.sourceInfo.data['comments'] != '') ?
                foundCandidate.sourceInfo.data['comments'] + '\n' + extra_evidence.evidenceDescription
                :
                extra_evidence.evidenceDescription;
        } else {
            // If not found, allow user to add evidence in new format
            isNew = true;
            data.sourceInfo = {'metadata': {}, 'data': {}};
            data.sourceInfo.metadata['_kind_key'] = 'PMID';
            data.sourceInfo.metadata['_kind_title'] = 'Pubmed';
            data.sourceInfo.metadata['pmid'] = pmid;
            data.sourceInfo.data['comments'] = extra_evidence.evidenceDescription;
        }
        // Set the button
        return (
            <EvidenceModalManager
                data = {data}
                allData = {extraEvidenceData}
                criteriaList = {this.state.criteriaList}
                evidenceType = 'PMID'
                subcategory = {this.props.subcategory}
                evidenceCollectionDone = {this.props.evidenceCollectionDone}
                isNew = {isNew}
                btnTitle = 'Add in New Format'
                disableActuator = {this.props.isBusy ? true : false}
                affiliation = {this.props.affiliation}
                session = {this.props.session}
                canCurrUserModifyEvidence = {this.props.canCurrUserModifyEvidence}
                setBusy = {this.props.setBusy}
            />
        );
    },

    renderInterpretationExtraEvidence: function(extra_evidence) {
        let affiliation = this.props.affiliation, session = this.props.session;
        let creatorAffiliation = extra_evidence.affiliation ? getAffiliationName(extra_evidence.affiliation) : null;
        let title = extra_evidence.submitted_by && extra_evidence.submitted_by.title ? extra_evidence.submitted_by.title : '';
        let creator = creatorAffiliation ? creatorAffiliation + ' (' + title + ')' : title;

        // Check if need to add 'Add in New Format' button for case segregation tab tables
        let addNewFormatEvidence = null;
        if (this.props.category === 'case-segregation' && !this.props.viewOnly &&
            ((affiliation && extra_evidence.affiliation && extra_evidence.affiliation === affiliation.affiliation_id) ||
            (!affiliation && !extra_evidence.affiliation && session && session.user_properties && extra_evidence.submitted_by['@id'] === session.user_properties['@id']))) {
                addNewFormatEvidence = this.getAddNewEvidenceButton(extra_evidence);
        }

        let criteriaInput = extra_evidence.evidenceCriteria && extra_evidence.evidenceCriteria !== 'none' ? extra_evidence.evidenceCriteria : '--';
        // for rendering the evidence in tabular format
        return (
            <tr key={extra_evidence.uuid}>
                <td className="col-md-4"><PmidSummary article={extra_evidence.articles[0]} pmidLinkout /></td>
                <td className="col-md-1"><p>{criteriaInput}</p></td>
                <td className="col-md-3"><p className="word-break">{extra_evidence.evidenceDescription}</p></td>
                <td className={!this.props.viewOnly ? "col-md-1" : "col-md-2"}>{creator}</td>
                <td className={!this.props.viewOnly ? "col-md-1" : "col-md-2"}>{moment(extra_evidence.date_created).format("YYYY MMM DD, h:mm a")}</td>
                {!this.props.viewOnly ?
                    <td className="col-md-2">
                        {!this.props.viewOnly && ((affiliation && extra_evidence.affiliation && extra_evidence.affiliation === affiliation.affiliation_id) ||
                            (!affiliation && !extra_evidence.affiliation && session && session.user_properties && extra_evidence.submitted_by['@id'] === session.user_properties['@id'])) ?
                            <div>
                                {this.props.category !== 'case-segregation' ?
                                    <button className="btn btn-primary btn-inline-spacer" onClick={() => this.editEvidenceButton(extra_evidence['@id'])}>Edit</button>
                                    : null}
                                {addNewFormatEvidence}
                                <ConfirmDelete evidence={extra_evidence} deleteEvidence={this.deleteEvidence}></ConfirmDelete>
                            </div>
                            : null}
                    </td>
                    : null}
            </tr>
        );
    },

    /**
     * Method to handle criteria selection change
     */
    handleCriteriaChange(ref, e) {
        if (ref === 'criteria-selection') {
            this.setState({criteriaInput: this.refs[ref].getValue()});
        } else if (ref === 'edit-criteria-selection') {
            this.setState({editCriteriaInput: this.refs[ref].getValue()});
        }
    },

    handleDescriptionChange: function(ref, e) {
        // handles updating the state on textbox input change
        if (ref === 'description') {
            this.setState({descriptionInput: this.refs[ref].getValue()});
        } else if (ref === 'edit-description') {
            this.setState({editDescriptionInput: this.refs[ref].getValue()});
        }
    },

    shouldDisableSaveButton(action) {
        let disabled = true;
        if (action === 'add') {
            if ((this.state.descriptionInput && this.state.descriptionInput.length) || this.state.criteriaInput !== 'none') {
                disabled = false;
            }
        } else if (action === 'edit') {
            if ((this.state.editDescriptionInput && this.state.editDescriptionInput.length) || this.state.editCriteriaInput !== 'none') {
                disabled = false;
            }
        }
        return disabled;
    },

    renderInterpretationExtraEvidenceEdit: function(extra_evidence) {
        const criteriaList = this.state.criteriaList;
        let criteriaInput = extra_evidence.evidenceCriteria && extra_evidence.evidenceCriteria.length ? extra_evidence.evidenceCriteria : this.state.criteriaInput;

        return (
            <tr key={extra_evidence.uuid}>
                <td colSpan="6">
                    <PmidSummary article={extra_evidence.articles[0]} className="alert alert-info" pmidLinkout />
                    <Form submitHandler={this.submitEditForm} formClassName="form-horizontal form-std">
                        <Input type="text" ref="edit-target" value={extra_evidence['@id']} inputDisabled={true} groupClassName="hidden" />
                        <Input type="text" ref="edit-pmid" value={extra_evidence.articles[0].pmid} inputDisabled={true} groupClassName="hidden" />
                        <div className="pmid-evidence-form clearfix">
                            <div className="col-xs-6 col-md-4 pmid-evidence-form-item criteria-selection">
                                <Input type="select" ref="edit-criteria-selection" label="Criteria:"
                                    defaultValue={criteriaInput} value={criteriaInput} handleChange={this.handleCriteriaChange}
                                    error={this.getFormError("edit-criteria-selection")} clearError={this.clrFormErrors.bind(null, "edit-criteria-selection")}
                                    labelClassName="col-xs-6 col-md-4 control-label" wrapperClassName="col-xs-12 col-sm-6 col-md-8" groupClassName="form-group">
                                    <option value="none">Select criteria code</option>
                                    <option disabled="disabled"></option>
                                    {criteriaList.map((item, i) => {
                                        return <option key={i} value={item}>{item}</option>;
                                    })}
                                </Input>
                            </div>
                            <div className="col-xs-12 col-sm-6 col-md-8 pmid-evidence-form-item evidence-input">
                                <Input type="textarea" ref="edit-description" rows="2" label="Evidence:" value={extra_evidence.evidenceDescription} defaultValue={extra_evidence.evidenceDescription}
                                    labelClassName="col-xs-2 control-label" wrapperClassName="col-xs-10" groupClassName="form-group" handleChange={this.handleDescriptionChange} />
                            </div>
                        </div>
                        <div className="clearfix">
                            <button className="btn btn-default pull-right btn-inline-spacer" onClick={this.cancelEditEvidenceButton}>Cancel Edit</button>
                            <Input type="submit" inputClassName="btn-primary pull-right btn-inline-spacer" id="submit" title="Save"
                                submitBusy={this.state.editBusy} inputDisabled={this.shouldDisableSaveButton('edit')} />
                            {this.state.updateMsg ?
                                <div className="submit-info pull-right">{this.state.updateMsg}</div>
                                : null}
                        </div>
                    </Form>
                </td>
            </tr>
        );
    },

    render: function() {
        let relevantEvidenceListRaw = [];
        if (this.state.variant && this.state.variant.associatedInterpretations) {
            this.state.variant.associatedInterpretations.map(interpretation => {
                if (interpretation.extra_evidence_list) {
                    interpretation.extra_evidence_list.map(extra_evidence => {
                        // Get extra evidences in old format for this subcategory
                        if (extra_evidence.subcategory === this.props.subcategory &&
                            !extraEvidenceHasSource(extra_evidence)) {
                                relevantEvidenceListRaw.push(extra_evidence);
                        }
                    });
                }
            });
        }
        let relevantEvidenceList = _(relevantEvidenceListRaw).sortBy(evidence => {
            return evidence.date_created;
        }).reverse();
        let parentObj = {/* // BEHAVIOR TBD
            '@type': ['evidenceList'],
            'evidenceList': relevantEvidenceList
        */};
        const criteriaList = this.state.criteriaList;
        const criteriaInput = this.state.criteriaInput;

        // If case segregation tab and no old format evidence, no table is displayed
        if (relevantEvidenceList.length === 0 && this.props.category === 'case-segregation') {
            return null;
        } else {
            return (
                <div className="panel panel-info">
                    <div className="panel-heading"><h3 className="panel-title">{this.props.tableName}</h3></div>
                    <div className="panel-content-wrapper">
                        <table className="table">
                            {relevantEvidenceList.length > 0 ?
                                <thead>
                                    <tr>
                                        <th>Article</th>
                                        <th>Criteria</th>
                                        <th>Evidence</th>
                                        <th>Last edited by</th>
                                        <th>Last edited</th>
                                        {!this.state.viewOnly? <th></th> : null}
                                    </tr>
                                </thead>
                                : null}
                            <tbody>
                                {!this.props.viewOnly && this.props.category !== 'case-segregation' ?
                                    <tr>
                                        <td colSpan="6">
                                            {this.state.tempEvidence ?
                                                <span>
                                                    <PmidSummary article={this.state.tempEvidence} className="alert alert-info" pmidLinkout />
                                                    <Form submitHandler={this.submitForm} formClassName="form-horizontal form-std">
                                                        <div className="pmid-evidence-form clearfix">
                                                            <div className="col-xs-6 col-md-4 pmid-evidence-form-item criteria-selection">
                                                                <Input type="select" ref="criteria-selection" defaultValue={criteriaInput} label="Criteria:" handleChange={this.handleCriteriaChange}
                                                                    error={this.getFormError("criteria-selection")} clearError={this.clrFormErrors.bind(null, "criteria-selection")}
                                                                    labelClassName="col-xs-6 col-md-3 control-label" wrapperClassName="col-xs-12 col-sm-6 col-md-9" groupClassName="form-group">
                                                                    <option value="none">Select criteria code</option>
                                                                    <option disabled="disabled"></option>
                                                                    {criteriaList.map((item, i) => {
                                                                        return <option key={i} value={item}>{item}</option>;
                                                                    })}
                                                                </Input>
                                                            </div>
                                                            <div className="col-xs-12 col-sm-6 col-md-8 pmid-evidence-form-item evidence-input">
                                                                <Input type="textarea" ref="description" rows="2" label="Evidence:" handleChange={this.handleDescriptionChange}
                                                                    labelClassName="col-xs-2 control-label" wrapperClassName="col-xs-10" groupClassName="form-group" />
                                                            </div>
                                                        </div>
                                                        <div className="clearfix">
                                                            <AddResourceId resourceType="pubmed" protocol={this.props.href_url.protocol} parentObj={parentObj} buttonClass="btn-info"
                                                                buttonText="Edit PMID" modalButtonText="Add Article" updateParentForm={this.updateTempEvidence} buttonOnly={true} />
                                                            <button className="btn btn-default pull-right btn-inline-spacer" onClick={this.cancelAddEvidenceButton}>Cancel</button>
                                                            <Input type="submit" inputClassName="btn-primary pull-right btn-inline-spacer" id="submit" title="Save"
                                                                submitBusy={this.state.submitBusy} inputDisabled={this.shouldDisableSaveButton('add')} />
                                                            {this.state.updateMsg ?
                                                                <div className="submit-info pull-right">{this.state.updateMsg}</div>
                                                                : null}
                                                        </div>
                                                    </Form>
                                                </span>
                                                :
                                                <span>
                                                    <AddResourceId resourceType="pubmed" protocol={this.props.href_url.protocol} parentObj={parentObj} buttonClass="btn-primary"
                                                        buttonText="Add PMID" modalButtonText="Add Article" updateParentForm={this.updateTempEvidence} buttonOnly={true} />
                                                    &nbsp;&nbsp;Select "Add PMID" to curate and save a piece of evidence from a published article.
                                                </span>
                                            }
                                        </td>
                                    </tr>
                                    : null}
                                {relevantEvidenceList.length > 0 ?
                                    relevantEvidenceList.map(evidence => {
                                        return (this.state.editEvidenceId === evidence['@id']
                                            ? this.renderInterpretationExtraEvidenceEdit(evidence)
                                            : this.renderInterpretationExtraEvidence(evidence));
                                    })
                                    : <tr><td colSpan={!this.props.viewOnly ? "5" : "4"}><span>&nbsp;&nbsp;No evidence added.</span></td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }
    }
});
