'use strict';

/**
 * Manages the addition and editing of new evidence through two modals:
 * 
 * 1. Metadata about the new evidence type (e.g. name of PI, database location, clinical lab contact info, etc.)
 * 2. The evidence itself (e.g. number of unaffected variant carriers, associated phenotypes, etc.)
 * 
 */

// stdlib
import React from 'react';
import PropTypes from 'prop-types';
import createReactClass from 'create-react-class';

// Third-party lib
import { FormMixin } from '../../../../libs/bootstrap/form';
import { parsePubmed } from '../../../../libs/parse-pubmed';

// Internal lib
import { RestMixin } from '../../../rest';
import { external_url_map } from '../../../globals';
import { EvidenceSheet } from './evidenceSheet';
import { extraEvidence } from './segregationData';
import { NewEvidenceModalMetadata } from './newEvidenceModalMetadata';

let EvidenceModalManager = createReactClass({
    mixins: [FormMixin, RestMixin],

    propTypes: {
        data: PropTypes.object,                     // If null, we are adding.  Otherwise, we are editing.
        allData: PropTypes.array,                   // All extra evidence we've collected
        criteriaList: PropTypes.array,              // Criteria code(s) pertinent to the category/subcategory
        evidenceType: PropTypes.string,             // Evidence source type
        subcategory: PropTypes.string,              // Subcategory (usually the panel) the evidence is part of
        evidenceCollectionDone: PropTypes.func,     // Function to call when we finish with modal 2
        isNew: PropTypes.bool,                      // If we are adding a new piece of evidence or editing an existing piece
        btnTitle: PropTypes.string,                 // Custom link text for adding/editing evidence
        useIcon: PropTypes.bool,                    // Use an icon instead of text as link text  
        disableActuator: PropTypes.bool,            // Disable the actuator or not
        affiliation: PropTypes.object,              // The user's affiliation
        session: PropTypes.object,                  // The session object
        canCurrUserModifyEvidence: PropTypes.func,  // Function to check if current logged in user can modify the given evidence
        setBusy: PropTypes.func                     // Function to set case segregation page edit state
    },

    getInitData(){
        let source = {};
        // If current evidence has sourceInfo data, set as default
        if (this.props.data && this.props.data.sourceInfo) {
            source = this.props.data.sourceInfo;
            // If pmid is not set in sourceInfo metadata, check current evidence articles array
            if (source.metadata['_kind_key'] === 'PMID') {
                if (source.metadata.pmid == undefined) {
                    source.metadata.pmid = this.props.data.articles && this.props.data.articles.length > 0 ? this.props.data.articles[0].pmid : '';
                }
            }
        }
        else {
            source = {'metadata': {}, 'data': {}}
        }

        return source;
    },

    getInitialState() {
        let data = this.getInitData();
        return {
            nextModal: false,        // Flag if able to go to next data form  
            sourceData: data,        // Source data being added/edited
            isNew: this.props.isNew  // This may change from T -> F if a matching identifier is found.  See metadataDone() for details.
        };
    },

    componentDidMount(){
        let data = this.getInitData();
        this.setState({
            sourceData: data
        });
    },

    componentWillReceiveProps(nextProps) {
        if(nextProps.data != null && nextProps.data.sourceInfo != null) {
            this.setState({
                sourceData: nextProps.data.sourceInfo
            });
        }
        if (nextProps.isNew != null && nextProps.isNew !== this.state.isNew) {
            this.setState({
                isNew: nextProps.isNew
            });
        }
    },

    /**
     * If editing current evidence, return its id.
     * If adding new one, return null.
     */
    getCurrentEvidenceId() {
        // If existing evidence has id, return its id.
        if (this.props.data && this.props.data['@id']) {
            return (this.props.data['@id']);
        }
        else {
            // If adding evidence but same evidence exits, return existing evidence id.
            let foundEvidence = this.getExistingEvidence(this.state.sourceData.metadata);
            if (foundEvidence) {
                return (foundEvidence['@id']);
            }
        }
        // If adding new evidence, return null;
        return null;
    },

    /**
     * Check if an existing evidence has same data as given metadata.
     * If yes, return that evidence; else null.
     * 
     * @param {object} metadata  The metadata object
     */
    getExistingEvidence(metadata) {
        let result = null;
        // Only match pmid source, not other non-published sources which are just free text
        if (metadata['_kind_key'] === 'PMID') {
            let identifierCol = extraEvidence.typeMapping[this.props.evidenceType].fields
                .filter(o => o.identifier === true)
                .map(o => o.name);

            // Determine if this is meant to be linked to an existing piece of evidence that current user can modify
            let candidates = this.props.allData ? this.props.allData
                .filter(o => identifierCol in o.sourceInfo.metadata
                    && o.sourceInfo.metadata[identifierCol] === metadata[identifierCol]) : [];
            if (candidates.length > 0) {
                candidates.forEach(candidate => {
                    if (this.props.canCurrUserModifyEvidence(candidate)) {
                        result = candidate;
                    }
                });
            }
        }
        return result;
    },

    /**
     * Here, we need to check the identifier field against all other known identifier fields.  If we get a match,
     * then we know that even if we were told this is a new entry, it's really an edit of an existing entry that
     * was initially entered in a separate panel.
     *
     * @param {bool} next           T -> Move to next screen, F -> Cancel was clicked
     * @param {object} metadata     The metadata object returned from the modal
     */
    metadataDone(next, metadata) {
        if (next) {
            let candidate = this.getExistingEvidence(metadata);
            let newData = Object.assign({}, this.state.sourceData);
            if (this.props.isNew) {
                if (candidate) {
                    // Editing a piece of evidence initially input in a different panel
                    Object.assign(candidate.sourceInfo.metadata, metadata);
                    Object.assign(newData, candidate.sourceInfo);
                    this.setState({
                        isNew: false
                    });
                } else {
                    // Totally new piece of evidence
                    Object.assign(newData.metadata, metadata);
                    this.setState({
                        isNew: true
                    });
                }
            } else {
                // Editing existing evidence
                Object.assign(newData.metadata, metadata);
            }

            // If source is PMID and new evidence, check if Pubmed article needs to be added.
            if (metadata._kind_key === 'PMID' && metadata.pmid && this.state.isNew) {
                this.getRestData('/search/?type=article&pmid=' + metadata.pmid).then(check => {
                    // Article is new to our DB
                    if (check.total < 1) {
                        // PubMed article not in our DB; go out to PubMed itself to retrieve it as XML
                        // Disable the evidence details modal submit button until the article is added to database.
                        // If add fails, the submit will still be disabled and an error message is updated on the modal.
                        this.sheetModal.enableSubmitButton(false);
                        let data = {};
                        this.getRestDataXml(external_url_map['PubMedSearch'] + metadata.pmid).then(xml => {
                            data = parsePubmed(xml);
                            if (data.pmid) { 
                                // Found the article and add it to DB
                                this.postRestData('/article/', data).then(result => {
                                    // Article is added so enable the submit button.
                                    this.sheetModal.enableSubmitButton(true);
                                    Promise.resolve(result['@graph'][0]);
                                }).catch(error => {
                                    this.sheetModal.showError('Error in saving Pubmed article to database.  Please try again later.');
                                    console.error('Error in saving Pubmed article to database.');
                                });
                            } else {
                                this.sheetModal.showError('PMID is invalid - ' + metadata.pmid);
                                console.error('PMID is invalid - ' + metadata.pmid);
                            }
                        }).catch(error => {
                            this.sheetModal.showError('PMID is invalid - ' + metadata.pmid);
                            console.error('PMID is invalid - ' + metadata.pmid);
                        });
                    }
                });
            }

            this.setState({
                sourceData: newData,
                nextModal: true
            });
        } else {
            // Cancelled
            this.setState({
                nextModal: false,
                sourceData: this.getInitData()
            });
        }
    },

    reset() {
        this.setState({
            nextModal: false,
            isNew: false,
            sourceData: this.getInitData()
        });
    },

    /**
     * Save the evidence and reset form data.
     * 
     * @param {object} data  THe evidence data object returned from modal form
     */
    sheetDone(data) {
        if (data === null) {
            // No change is needed
            this.props.evidenceCollectionDone(false, this.state.sourceData, this.getCurrentEvidenceId(), this.props.subcategory, null);
        }
        else {
            if (this.props.setBusy) {
                this.props.setBusy(true);
            }
            // Remove empty fields and unnecessary fields - submitted_by, last_modified, _kind_title from source data
            let hasData = Object.keys(data).reduce((object, key) => { 
                if (data[key] !== '' && !key.startsWith('_') ) {
                    object[key] = data[key]
                }
                return object
            }, {})

            // Combine the changes with existing data
            let newData = Object.assign({}, this.state.sourceData);
            newData.data = {};
            Object.assign(newData.data, hasData);
            newData['relevant_criteria'] = this.props.criteriaList;
            // if editing existing evidence, get its created date.
            let dateCreated = this.props.data ? this.props.data.date_created : null;
            // Save the evidence data
            this.props.evidenceCollectionDone(true, newData, this.getCurrentEvidenceId(), this.props.subcategory, dateCreated);
        }
        this.reset();
    },

    /**
     * Return the evidence data object
     */
    getSheetData() {
        return this.state.sourceData.data;
    },

    /**
     * Return the evidence metadata object
     */
    getMetadata() {
        return this.state.sourceData.metadata;
    },

    /**
     * Bring up the second modal form for evidence data
     */
    evidenceSheet() {
        if (!this.state.nextModal) {
            return null;
        } else {
            return <EvidenceSheet
                        ready = {this.state.nextModal}
                        sheetDone = {this.sheetDone}
                        data = {this.getSheetData()}
                        allData = {this.props.data}
                        isNew = {this.state.isNew}
                        isFromMaster = {this.props.useIcon}
                        subcategory = {this.props.subcategory}
                        evidenceType = {this.props.evidenceType}
                        onRef={ref => (this.sheetModal = ref)}
                    >
                    </EvidenceSheet>
        }
    },

    render() {
        let jsx = <span>
            <NewEvidenceModalMetadata
                evidenceType = {this.props.evidenceType}
                metadataDone = {this.metadataDone}
                data = {this.getMetadata()}
                isNew = {this.props.isNew}
                btnTitle = {this.props.btnTitle}
                useIcon = {this.props.useIcon}
                disableActuator = {this.props.disableActuator}
            />
            {this.evidenceSheet()}
        </span>;
        return jsx;
    }
});

module.exports = {
    EvidenceModalManager: EvidenceModalManager
}
