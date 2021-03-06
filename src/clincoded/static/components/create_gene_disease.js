'use strict';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import createReactClass from 'create-react-class';
import _ from 'underscore';
import moment from 'moment';
import { curator_page, history_views, external_url_map } from './globals';
import { RestMixin } from './rest';
import { Form, FormMixin, Input } from '../libs/bootstrap/form';
import { Panel } from '../libs/bootstrap/panel';
import { parseAndLogError } from './mixins';
import * as CuratorHistory from './curator_history';
import ModalComponent from '../libs/bootstrap/modal';
import { GdmDisease } from './disease';
import { getAffiliationName } from '../libs/get_affiliation_name';
import { isUserAllowedToCreateGdm } from '../libs/allow_create_gdm';
import { parseHGNC, filterGeneForHGNCComparison } from '../libs/parse-hgnc';

var modesOfInheritance = require('./mapping/modes_of_inheritance.json');

var CreateGeneDisease = createReactClass({
    mixins: [FormMixin, RestMixin, CuratorHistory],

    contextTypes: {
        fetch: PropTypes.func,
        navigate: PropTypes.func
    },

    getInitialState: function() {
        return {
            gdm: {},
            hgncgene: '',
            orphanetid: '',
            diseaseObj: {},
            diseaseUuid: null,
            diseaseError: null,
            adjectives: [],
            adjectiveDisabled: true,
            submitBusy: false  // Flag to indicate that the submit button is in a 'busy' state
        };
    },

    // Handle value changes in modeInheritance dropdown selection
    handleChange: function(ref, e) {
        if (ref === 'modeInheritance') {
            let selected = this.refs[ref].getValue();
            /******************************************************/
            /* If 'X-linked inheritance' is selected,             */
            /* enable adjective menu and set it a required field. */
            /* If 'Autosomal dominant inheritance' is selected,   */
            /* or 'Autosomal recessive inheritance is selected,   */
            /* enable adjective menu only & set it not required.  */
            /* Everything else, disable adjective menu.           */
            /******************************************************/
            if (selected.indexOf('X-linked inheritance') > -1) {
                this.handleAdjectives(false, modesOfInheritance['X-linked inheritance (HP:0001417)']);
            } else if (selected.indexOf('Autosomal dominant inheritance') > -1) {
                this.handleAdjectives(false, modesOfInheritance['Autosomal dominant inheritance (HP:0000006)']);
            } else if (selected.indexOf('Autosomal recessive inheritance') > -1) {
                this.handleAdjectives(false, modesOfInheritance['Autosomal recessive inheritance (HP:0000007)']);
            } else if (selected.indexOf('Mitochondrial inheritance') > -1) {
                this.handleAdjectives(false, modesOfInheritance['Mitochondrial inheritance (HP:0001427)']);
            } else if (selected.indexOf('Other') > -1) {
                this.handleAdjectives(false, modesOfInheritance['Other']);
            } else {
                this.handleAdjectives(true, []);
            }
        }
    },

    // Helper method for the 'handleChange' method to minimize repetitive code
    handleAdjectives: function(adjectiveDisabled, adjectives) {
        this.setState({
            adjectiveDisabled: adjectiveDisabled,
            adjectives: adjectives
        }, () => {this.refs.moiAdjective.setValue('none');});
    },

    // Form content validation
    validateForm: function() {
        // Start with default validation
        var valid = this.validateDefault();

        // Check if orphanetid
        if (valid) {
            let mode = this.refs['modeInheritance'].getValue();
            if (!mode.length || mode.indexOf('select') > -1) {
                this.setFormErrors('modeInheritance', 'Mode of inheritance is required');
                valid = false;
            }
            if (!this.state.diseaseObj || (this.state.diseaseObj && !this.state.diseaseObj['term'])) {
                this.setState({ diseaseError: 'Disease is required!' });
                valid = false;
            }
        }
        return valid;
    },

    editGdm: function() {
        this.context.navigate('/curation-central/?gdm=' + this.state.gdm.uuid);
    },

    /**
     * Method to post GDM creation data to /track-data which sends data to Data Exchange for UNC tracking system
     * @param {object} data - data object
     */
    postGdmCreationData: function(data) {
        return new Promise((resolve, reject) => {
            if (data) {
                this.postRestData('/track-data', data).then(result => {
                    if (result.status === 'Success') {
                        console.log('Post tracking data succeeded: %o', result);
                        resolve(result);
                    } else {
                        console.log('Post tracking data failed with Error - %o ', result);
                        reject(result);
                    }
                }).catch(error => {
                    console.log('Post tracking data internal data retrieval error: %o', error);
                    reject(error);
                });
            } else {
                console.log('Post tracking data Error: Missing expected GDM creation data');
                reject({'message': 'Missing expected GDM creation data'});
            }
        });
    },

    /**
     * Method to create necessary data object to be sent to Data Exchange for UNC tracking
     * @param {object} gdm - GDM object
     * @param {string} hgncId - HGNC Id
     */
    setUNCData: function(gdm, hgncId) {
        const diseaseObj = this.state.diseaseObj
        const submitter = this.props.session && this.props.session.user_properties ? this.props.session.user_properties : null;
        const submitterName = submitter && submitter.title ? submitter.title : '';
        const submitterUuid = submitter && submitter.uuid ? submitter.uuid : '';
        const submitterEmail = submitter && submitter.email ? submitter.email : '';
        const start = gdm.modeInheritance ? gdm.modeInheritance.indexOf('(') : -1;
        const end = gdm.modeInheritance ? gdm.modeInheritance.indexOf(')') : -1;
        const hpoNumber = (start > -1 && end > -1) ? gdm.modeInheritance.substring(start + 1, end) : gdm.modeInheritance ? gdm.modeInheritance : '';
        return {
            report_id: gdm.uuid,
            gene_validity_evidence_level: {
                genetic_condition: {
                    mode_of_inheritance: hpoNumber,
                    condition: diseaseObj.diseaseId ? diseaseObj.diseaseId.replace('_', ':') : '',
                    gene: hgncId
                },
                evidence_level: '',
                gene_validity_sop: ''
            },
            date: moment(gdm.date_created).toISOString(),
            status: 'created',
            performed_by: {
                name: submitterName,
                id: submitterUuid,
                email: submitterEmail,
                on_behalf_of: {
                    id: gdm.affiliation ? gdm.affiliation : '',
                    name: gdm.affiliation ? getAffiliationName(gdm.affiliation, 'gcep') : ''
                }
            },
            contributors: [
                {
                    name: submitterName,
                    id: submitterUuid,
                    email: submitterEmail,
                    roles: ["creator"]
                }
            ]
        };
    },

    // When the form is submitted...
    submitForm: function(e) {
        e.preventDefault(); e.stopPropagation(); // Don't run through HTML submit handler

        // If login user curating as part of an affiliation that has a GCEP then able to create new GDMs
        if (isUserAllowedToCreateGdm(this.props.session, this.props.affiliation)) {
            // Get values from form and validate them
            this.saveFormValue('hgncgene', this.refs.hgncgene.getValue().toUpperCase());
            /**
             * FIXME: Need to delete orphanet reference
             */
            // this.saveFormValue('orphanetid', this.refs.orphanetid.getValue());
            this.saveFormValue('modeInheritance', this.refs['modeInheritance'].getValue());
            let moiAdjectiveValue = this.refs.moiAdjective.getValue();
            if (moiAdjectiveValue && moiAdjectiveValue !== 'none') {
                this.saveFormValue('moiAdjective', moiAdjectiveValue);
            }
            if (this.validateForm()) {
                // Get the free-text values for the Orphanet ID and the Gene ID to check against the DB
                /**
                 * FIXME: Need to delete orphanet reference
                 */
                // var orphaId = this.getFormValue('orphanetid').match(/^ORPHA:?([0-9]{1,6})$/i)[1];
                this.setState({ submitBusy: true });
                var geneId = this.getFormValue('hgncgene');
                var mode = this.getFormValue('modeInheritance');
                let adjective = this.getFormValue('moiAdjective');
                const diseaseObj = this.state.diseaseObj;
                let hgncId = '';
                let geneSelectionError = 'Unexpected response from HGNC';

                // Check HGNC for user-supplied gene symbol
                this.getRestData(this.props.href_url.protocol + external_url_map['HGNCFetch'] + geneId).then(hgncResponse => {
                    if (hgncResponse.response && hgncResponse.response.numFound > 0) {
                        const hgncGene = hgncResponse.response.docs ? parseHGNC(hgncResponse.response.docs[0]) : null;

                        if (hgncGene) {
                            this.saveFormValue('hgncgene', hgncGene.symbol);
                            geneId = hgncGene.symbol;
                            hgncId = hgncGene.hgncId;
                            geneSelectionError = 'Search by HGNC ID failed';
                        } else {
                            throw geneSelectionError;
                        }

                        // Check if gene already present in DB (by HGNC ID)
                        return this.getRestData('/search?type=gene&hgncId=' + hgncId).then(searchResponse => {
                            if (searchResponse.total === 0) {
                                geneSelectionError = 'Failed to save gene data';

                                // Add gene to DB
                                return this.postRestData('/genes/', hgncGene).then(postResult => {
                                    geneSelectionError = '';
                                    return postResult['@graph'] ? postResult['@graph'][0] : postResult;
                                });
                            } else if (searchResponse['@graph'] && searchResponse['@graph'][0]) {
                                geneSelectionError = 'Request for gene data failed';

                                // Retrieve gene from DB
                                return this.getRestData(searchResponse['@graph'][0]['@id']).then(geneResponse => {
                                    const localGene = geneResponse.uuid ? filterGeneForHGNCComparison(geneResponse) : null;

                                    if (!_.isEqual(hgncGene, localGene)) {
                                        geneSelectionError = 'Failed to update gene data';

                                        // Update gene in DB
                                        return this.putRestData('/genes/' + geneResponse.uuid, hgncGene).then(putResult => {
                                            geneSelectionError = '';
                                            return putResult['@graph'] ? putResult['@graph'][0] : putResult;
                                        });
                                    } else {
                                        geneSelectionError = '';
                                        return geneResponse;
                                    }
                                });
                            } else {
                                geneSelectionError = 'Unexpected response when verifying HGNC ID';
                                throw geneSelectionError;
                            }
                        });
                    } else {
                        geneSelectionError = 'Symbol not found at HGNC';
                        throw geneSelectionError;
                    }
                }).then(response => {
                    // Check DB for user-supplied disease
                    return this.getRestData('/search?type=disease&diseaseId=' + diseaseObj.diseaseId).then(diseaseSearch => {
                        let diseaseUuid;
                        if (diseaseSearch.total === 0) {
                            this.postRestData('/diseases/', diseaseObj).then(result => {
                                let newDisease = result['@graph'][0];
                                diseaseUuid = newDisease['uuid'];
                                this.setState({ diseaseUuid: diseaseUuid });
                            });
                        } else {
                            let _id = diseaseSearch['@graph'][0]['@id'];
                            diseaseUuid = _id.slice(10, -1);
                            this.setState({ diseaseUuid: diseaseUuid });
                        }
                    });
                }).then(data => {
                    // Load GDM if one with matching gene/disease/mode already exists
                    return this.getRestData(
                        '/search/?type=gdm&disease.diseaseId=' + diseaseObj.diseaseId + '&gene.symbol=' + geneId + '&modeInheritance=' + mode
                    ).then(gdmSearch => {
                        if (gdmSearch.total === 0) {
                            // Matching GDM not found. Create a new GDM
                            let newGdm = {
                                gene: geneId,
                                disease: this.state.diseaseUuid,
                                modeInheritance: mode
                            };
                            if (adjective && adjective.length) {
                                newGdm['modeInheritanceAdjective'] = adjective;
                            }

                            // Add affiliation if the user is associated with an affiliation
                            // and if the data object has no affiliation
                            if (this.props.affiliation && Object.keys(this.props.affiliation).length) {
                                if (!newGdm.affiliation) {
                                    newGdm.affiliation = this.props.affiliation.affiliation_id;
                                }
                            }

                            // Post the new GDM to the DB. Once promise returns, go to /curation-central page with the UUID
                            // of the new GDM in the query string.
                            return this.postRestData('/gdm/', newGdm).then(data => {
                                var newGdm = data['@graph'][0];

                                // Record history of adding a GDM
                                var meta = {
                                    gdm: {
                                        operation: 'add',
                                        gene: newGdm.gene,
                                        disease: newGdm.disease
                                    }
                                };
                                this.recordHistory('add', newGdm, meta);

                                // Gather GDM creation data to be sent to Data Exchange
                                let uncData = this.setUNCData(newGdm, hgncId);

                                // Post GDM creation data to Data Exchange
                                this.postGdmCreationData(uncData).then(response => {
                                    console.log('Successfully sent GDM creation data to Data Exchange for GDM %s at %s', newGdm.uuid, moment(newGdm.date_created).toISOString());
                                }).catch(error => {
                                    console.log('Error sending GDM creation data to Data Exchange for GDM %s at %s - Error: %o', newGdm.uuid, moment(newGdm.date_created).toISOString(), error);
                                });
                                // Navigate to Record Curation
                                var uuid = data['@graph'][0].uuid;
                                this.context.navigate('/curation-central/?gdm=' + uuid);
                            });
                        } else {
                            // Found matching GDM. See of the user wants to curate it.
                            this.setState({
                                gdm: gdmSearch['@graph'][0],
                                submitBusy: false
                            });
                            this.child.openModal();
                        }
                    });
                }).catch(e => {
                    // Some unexpected error happened
                    if (geneSelectionError) {
                        this.setFormErrors('hgncgene', geneSelectionError);
                    }
                    parseAndLogError.bind(undefined, 'fetchedRequest');
                    this.setState({ submitBusy: false });            });
            }
        }
    },

    // Called when any of the alert's buttons is clicked. Confirm is true if the 'Create' button was clicked;
    // false if the 'Cancel' button was clicked.
    handleAlertClick: function(confirm, e) {
        if (confirm) {
            this.editGdm();
        }
        this.child.closeModal();
    },

    /**
     * Update the 'diseaseObj' state used to save data upon form submission
     */
    updateDiseaseObj(diseaseObj) {
        this.setState({ diseaseObj: diseaseObj });
    },

    /**
     * Clear error msg on missing disease
     */
    clearErrorInParent() {
        this.setState({ diseaseError: null });
    },

    render: function() {
        let hgncgene = this.state.hgncgene;
        let orphanetid = this.state.orphanetid;
        let adjectives = this.state.adjectives;
        let adjectiveDisabled = this.state.adjectiveDisabled;
        const moiKeys = Object.keys(modesOfInheritance);
        let gdm = this.state.gdm;
        const submitBusy = this.state.submitBusy;
        const allowToCreateGDM = isUserAllowedToCreateGdm(this.props.session, this.props.affiliation);
        const submitClass = 'btn-default pull-right ' + (allowToCreateGDM ? '' : ' disabled');
        const submitErrClass = 'submit-err pull-right ' + (allowToCreateGDM ? ' hidden' : '');

        return (
            <div className="container">
                <h1>{this.props.context.title}</h1>
                <div className="col-md-8 col-md-offset-2 col-sm-9 col-sm-offset-1 form-create-gene-disease">
                    <p className="alert alert-warning note-gene-tracking-system">
                        <span><i className="icon icon-exclamation-triangle"></i> Before proceeding with curation, make sure all relevant precuration has been
                            performed and catalogued into the <a href="http://clingen.sirs.unc.edu" target="_blank">Gene Tracking System</a></span>
                    </p>
                    <Panel panelClassName="panel-create-gene-disease">
                        <Form submitHandler={this.submitForm} formClassName="form-horizontal form-std">
                            <div className="row">
                                <Input type="text" ref="hgncgene" label={<LabelHgncGene />} placeholder="e.g. DICER1" value={hgncgene}
                                    error={this.getFormError('hgncgene')} clearError={this.clrFormErrors.bind(null, 'hgncgene')}
                                    labelClassName="col-sm-5 control-label" wrapperClassName="col-sm-7" groupClassName="form-group" inputClassName="uppercase-input" required />
                                <GdmDisease gdm={gdm} updateDiseaseObj={this.updateDiseaseObj} clearErrorInParent={this.clearErrorInParent}
                                    error={this.state.diseaseError} session={this.props.session} />
                                <Input type="select" ref="modeInheritance" label="Mode of Inheritance" defaultValue="select" handleChange={this.handleChange}
                                    error={this.getFormError('modeInheritance')} clearError={this.clrFormErrors.bind(null, 'modeInheritance')}
                                    labelClassName="col-sm-5 control-label" wrapperClassName="col-sm-7" groupClassName="form-group" inputClassName="modeOfInheritance" required>
                                    <option value="select" disabled="disabled">Select</option>
                                    <option value="" disabled="disabled"></option>
                                    {moiKeys.map(function(modeOfInheritance, i) {
                                        return <option key={i} value={modeOfInheritance}>{modeOfInheritance}</option>;
                                    })}
                                </Input>
                                <Input type="select" ref="moiAdjective" label="Select an adjective" defaultValue="none"
                                    error={this.getFormError('moiAdjective')} clearError={this.clrFormErrors.bind(null, 'moiAdjective')} inputDisabled={adjectiveDisabled}
                                    labelClassName="col-sm-5 control-label" wrapperClassName="col-sm-7" groupClassName="form-group" inputClassName="moiAdjective">
                                    <option value="none">Select</option>
                                    <option disabled="disabled"></option>
                                    {adjectives.map(function(adjective, i) {
                                        return <option key={i} value={adjective}>{adjective.match(/^(.*?)(?: \(HP:[0-9]*?\)){0,1}$/)[1]}</option>;
                                    })}
                                </Input>
                                <div><p className="alert alert-warning">The above options (gene, disease, mode of inheritance, or adjective) can be altered for a Gene:Disease record up until a PMID has been added to the record. This includes
                                    adding an adjective to a Gene:Disease:Mode of inheritance record that has already been created or editing an adjective associated with a record.</p></div>
                                <Input type="submit" inputClassName={submitClass} submitBusy={submitBusy} id="submit" />
                            </div>
                        </Form>
                        {gdm && gdm.gene && gdm.disease && gdm.modeInheritance ?
                            <ModalComponent modalClass="modal-default" modalWrapperClass="confirm-edit-gdm-modal" onRef={ref => (this.child = ref)}>
                                <div>
                                    <div className="modal-body">
                                        <p>A curation record already exists for <strong>{gdm.gene.symbol} &#8211; {gdm.disease.term} &#8211; {gdm.modeInheritance}</strong>. You may curate this existing record, or cancel to specify a different gene &#8211; disease &#8211; mode.</p>
                                    </div>
                                    <div className='modal-footer'>
                                        <Input type="button" inputClassName="btn-default btn-inline-spacer" clickHandler={this.handleAlertClick.bind(null, false)} title="Cancel" />
                                        <Input type="button" inputClassName="btn-default btn-inline-spacer" clickHandler={this.handleAlertClick.bind(null, true)} title="Curate" />
                                    </div>
                                </div>
                            </ModalComponent>
                        : null}
                        <div className={submitErrClass}>Only GCEP curators have permission to create new Gene-Disease Records</div>
                    </Panel>
                </div>
            </div>
        );
    }
});

curator_page.register(CreateGeneDisease, 'curator_page', 'create-gene-disease');


// HTML labels for inputs follow.
class LabelHgncGene extends Component {
    render() {
        return <span>Enter <a href="http://www.genenames.org" target="_blank" title="HGNC home page in a new tab">HGNC</a> gene symbol</span>;
    }
}

// Display a history item for adding a PMID to a GDM
class GdmAddHistory extends Component {
    render() {
        var history = this.props.history;
        var gdm = history.primary;
        var gdmMeta = history.meta.gdm;
        var gdmHref = '/curation-central/?gdm=' + gdm.uuid;

        return (
            <div>
                <a href={gdmHref}>
                    <strong>{gdmMeta.gene.symbol}-{gdmMeta.disease.term}-</strong>
                    <i>{gdm.modeInheritance.indexOf('(') > -1 ? gdm.modeInheritance.substring(0, gdm.modeInheritance.indexOf('(') - 1) : gdm.modeInheritance}</i>
                </a>
                <span> created</span>
                <span>; {moment(history.date_created).format("YYYY MMM DD, h:mm a")}</span>
            </div>
        );
    }
}

history_views.register(GdmAddHistory, 'gdm', 'add');
