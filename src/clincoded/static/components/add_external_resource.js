'use strict';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import createReactClass from 'create-react-class';
import _ from 'underscore';
import moment from 'moment';
import { RestMixin } from './rest';
import { userMatch, truncateString, external_url_map } from './globals';
import { Form, FormMixin, Input } from '../libs/bootstrap/form';
import { Panel } from '../libs/bootstrap/panel';
import { parseAndLogError } from './mixins';
import * as CuratorHistory from './curator_history';
import { parsePubmed } from '../libs/parse-pubmed';
import { parseClinvar, parseCAR, getTranscriptAllelesGeneSymbolSet } from '../libs/parse-resources';
import { getManeTranscriptTitleFromEnsemblTranscripts } from "../libs/get_mane_transcript";
import ModalComponent from '../libs/bootstrap/modal';
import { getHgvsNotation } from './variant_central/helpers/hgvs_notation';
import { getCanonicalTranscript, getCanonicalTranscriptTitleFromEnsemblTranscripts } from '../libs/get_canonical_transcript';
import * as curator from './curator';
const variantHgvsRender = curator.variantHgvsRender;
const PmidSummary = curator.PmidSummary;

// Class for the add resource button. This class only renders the button to add and clear the fields, and contains the modal wrapper.
// The modal itself is defined by the AddResourceIdModal class below.
var AddResourceId = module.exports.AddResourceId = createReactClass({
    propTypes: {
        resourceType: PropTypes.string, // specify what the resource you're trying to add is (passed to Modal)
        label: PropTypes.object, // html for the button's label
        labelVisible: PropTypes.bool, // specify whether or not the label is visible
        buttonText: PropTypes.string, // text for the button
        clearButtonText: PropTypes.string, // text for clear button
        modalButtonText: PropTypes.string, // text for submit button in modal
        initialFormValue: PropTypes.string, // specify the initial value of the resource, in case of editing (passed to Modal)
        fieldNum: PropTypes.string, // specify which field on the main form this should edit (passed to Modal)
        updateParentForm: PropTypes.func, // function to call upon pressing the Save button
        disabled: PropTypes.bool, // specify whether or not the button on the main form is disabled
        wrapperClass: PropTypes.string, // specify any special css classes for the button
        buttonWrapperClass: PropTypes.string, // specify any special css classes for the button
        buttonClass: PropTypes.string, // specify any special css classes for the button
        clearButtonClass: PropTypes.string, // specify any special css classes for the button
        buttonOnly: PropTypes.bool, // specify whether or not only the button should be rendered (no form-group)
        clearButtonRender: PropTypes.bool, // specify whether or not the Clear button should be rendered
        editButtonRenderHide: PropTypes.bool, // specify whether or not the Edit button should be hidden
        parentObj: PropTypes.object // parent object; used to see if a duplicate entry exists
    },

    getInitialState: function() {
        return {
            txtModalTitle: ''
        };
    },

    // set the text of the modal title on load
    componentDidMount: function() {
        switch(this.props.resourceType) {
            case 'pubmed':
                this.setState({txtModalTitle: pubmedTxt('modalTitle')});
                break;
            case 'clinvar':
                this.setState({txtModalTitle: clinvarTxt('modalTitle')});
                break;
            case 'car':
                this.setState({txtModalTitle: carTxt('modalTitle')});
                break;
        }
    },

    // called when the 'Clear' button is pressed on the main form
    resetForm: function(e) {
        this.props.updateParentForm(null, this.props.fieldNum);
    },

    // renders the main Add/Edit button
    buttonRender: function() {
        return (
            <span className={"inline-button-wrapper" + (this.props.buttonWrapperClass ? " " + this.props.buttonWrapperClass : "")}>
                <AddResourceIdModal
                    resourceType={this.props.resourceType}
                    initialFormValue={this.props.initialFormValue}
                    modalButtonText={this.props.modalButtonText}
                    fieldNum={this.props.fieldNum}
                    updateParentForm={this.props.updateParentForm}
                    protocol={this.props.protocol}
                    parentObj={this.props.parentObj}
                    title={this.state.txtModalTitle}
                    buttonText={this.props.buttonText}
                    buttonClass={(this.props.buttonClass ? this.props.buttonClass : "") + (this.props.disabled ? " disabled" : "")}
                />
            </span>
        );
    },

    // renders the main Clear button
    clearButtonRender: function() {
        return (
            <Input type="button" title={this.props.clearButtonText ? this.props.clearButtonText : "Clear"} inputClassName={"btn-default" + (this.props.clearButtonClass ? " " + this.props.clearButtonClass : "")} clickHandler={this.resetForm} />
        );
    },

    render: function() {
        if (this.props.buttonOnly) {
            return (
                <div className={"inline-button-wrapper" + (this.props.wrapperClass ? " " + this.props.wrapperClass : "")}>
                    {this.props.editButtonRenderHide && this.props.initialFormValue ? null : this.buttonRender()}
                    {this.props.clearButtonRender && this.props.initialFormValue ?
                        this.clearButtonRender()
                    : null}
                </div>
            );
        } else {
            return (
                <div className="form-group">
                    <span className="col-sm-5 control-label">{this.props.labelVisible ? this.props.label : null}</span>
                    <span className="col-sm-7">
                        <div className={"inline-button-wrapper" + (this.props.wrapperClass ? " " + this.props.wrapperClass : "")}>
                            {this.props.editButtonRenderHide && this.props.initialFormValue ? null : this.buttonRender()}
                            {this.props.clearButtonRender && this.props.initialFormValue ?
                                this.clearButtonRender()
                            : null}
                        </div>
                    </span>
                </div>
            );
        }
    }
});

// Class for the modal for adding external resource IDs
var AddResourceIdModal = createReactClass({
    mixins: [FormMixin, RestMixin, CuratorHistory],

    propTypes: {
        resourceType: PropTypes.string, // specify what the resource you're trying to add is
        initialFormValue: PropTypes.string, // specify the initial value of the resource, in case of editing
        modalButtonText: PropTypes.string, // text for submit button in modal
        fieldNum: PropTypes.string, // specify which field on the main form this should edit
        protocol: PropTypes.string, // Protocol to use to access PubMed ('http:' or 'https:')
        updateParentForm: PropTypes.func, // Function to call when submitting and closing the modal
        parentObj: PropTypes.object, // parent object; used to see if a duplicate entry exists
        title: PropTypes.string, // Text appearing in the modal header
        buttonText: PropTypes.string, // Text of the link/button invoking the modal
        buttonClass: PropTypes.string // CSS class of the link/button invoking the modal
    },

    contextTypes: {
        fetch: PropTypes.func // Function to perform a search
    },

    getInitialState: function() {
        return {
            txtInputLabel: '', // Text for the input's label (rendered above the input box)
            txtInputButton: '', // Text for the input's submit button (rendered below the input box)
            txtHelpText: '', // Text for blue box below input's submit button (disappears after the input button is clicked)
            txtResourceResponse: '', // Text to display once a response from the resource has been obtained
            inputValue: '', // Default value for input box
            queryResourceDisabled: true, // Flag to disable the input button
            queryResourceBusy: false, // Flag to indicate the input button's 'busy' state
            resourceFetched: false, // Flag to indicate that a response from the resource has been obtained
            tempResource: {}, // Temporary object to hold the resource response
            submitResourceBusy: false // Flag to indicate that the modal's submit button is in a 'busy' state (creating local db entry)
        };
    },

    // load text for different parts of the modal on load
    componentDidMount: function() {
        var tempTxtLabel;
        switch(this.props.resourceType) {
            case 'pubmed':
                if (this.props.initialFormValue) {
                    tempTxtLabel = pubmedTxt('editLabel');
                    this.setState({queryResourceDisabled: false});
                    this.setState({inputValue: this.props.initialFormValue});
                } else {
                    tempTxtLabel = pubmedTxt('inputLabel');
                }
                this.setState({
                    txtInputLabel: tempTxtLabel,
                    txtInputButton: pubmedTxt('inputButton'),
                    txtHelpText: pubmedTxt('helpText'),
                    txtResourceResponse: pubmedTxt('resourceResponse', this.props.modalButtonText ? this.props.modalButtonText : "Save")
                });
                break;
            case 'clinvar':
                if (this.props.initialFormValue) {
                    tempTxtLabel = clinvarTxt('editLabel');
                    this.setState({queryResourceDisabled: false});
                    this.setState({inputValue: this.props.initialFormValue});
                } else {
                    tempTxtLabel = clinvarTxt('inputLabel');
                }
                this.setState({
                    txtInputLabel: tempTxtLabel,
                    txtInputButton: clinvarTxt('inputButton'),
                    txtHelpText: clinvarTxt('helpText'),
                    txtResourceResponse: clinvarTxt('resourceResponse', this.props.modalButtonText ? this.props.modalButtonText : "Save")
                });
                break;
            case 'car':
                if (this.props.initialFormValue) {
                    tempTxtLabel = carTxt('editLabel');
                    this.setState({queryResourceDisabled: false});
                    this.setState({inputValue: this.props.initialFormValue});
                } else {
                    tempTxtLabel = carTxt('inputLabel');
                }
                this.setState({
                    txtInputLabel: tempTxtLabel,
                    txtInputButton: carTxt('inputButton'),
                    txtHelpText: carTxt('helpText'),
                    txtResourceResponse: carTxt('resourceResponse', this.props.modalButtonText ? this.props.modalButtonText : "Save")
                });
                break;
        }
    },

    // called when the button to ping the outside resource is pressed
    queryResource: function(e) {
        e.preventDefault(); e.stopPropagation(); // Don't run through HTML submit handler
        this.setState({queryResourceBusy: true, resourceFetched: false});
        // Apply queryResource logic depending on resourceType
        switch(this.props.resourceType) {
            case 'pubmed':
                pubmedQueryResource.call(this);
                break;
            case 'clinvar':
                clinvarQueryResource.call(this);
                break;
            case 'car':
                carQueryResource.call(this);
                break;
        }
    },

    // called when a resource result is returned; returns render elements for the result
    renderResourceResult: function() {
        var renderResult;
        switch(this.props.resourceType) {
            case 'pubmed':
                renderResult = pubmedRenderResourceResult.call(this);
                break;
            case 'clinvar':
            case 'car':
                renderResult = clinvarAndCarRenderResourceResult.call(this);
                break;
        }
        return renderResult;
    },

    // called when the button to submit the resource to the main form (local db) is pressed
    submitResource: function(e) {
        e.preventDefault(); e.stopPropagation();
        // Apply submitResource logic depending on resourceType
        switch(this.props.resourceType) {
            case 'pubmed':
                pubmedSubmitResource.call(this, this.handleModalClose);
                break;
            case 'clinvar':
                clinvarSubmitResource.call(this, this.handleModalClose);
                break;
            case 'car':
                carSubmitResource.call(this, this.handleModalClose);
                break;
        }
    },

    // called when the value in the input field is changed
    handleChange: function(e) {
        if (this.refs.resourceId) {
            var tempResourceId = this.refs.resourceId.getValue();
            this.setState({inputValue: tempResourceId, resourceFetched: false, tempResource: {}});
            if (this.refs.resourceId.getValue().length > 0) {
                this.setState({queryResourceDisabled: false});
            } else {
                this.setState({queryResourceDisabled: true});
            }
        }
    },

    // Called when the modal form's cancel button is clicked. Just closes the modal like
    // nothing happened.
    cancelForm: function(e) {
        // Changed modal cancel button from a form input to a html button
        // as to avoid accepting enter/return key as a click event.
        // Removed hack in this method.
        this.handleModalClose('cancel');
    },

    /************************************************************************************************/
    /* Resetting the formErrors for selected input and other states was not needed previously       */
    /* because the previous MixIn implementation allowed the actuator (button to show the modal)    */
    /* to be defined outside of this component and closing the modal would delete this component    */
    /* from virtual DOM, along with the states.                                                     */
    /* The updated/converted implementation (without MixIn) wraps the actuator in the modal         */
    /* component and thus this component always exists in the virtual DOM as long as the actuator   */
    /* needs to be rendered in the UI. As a result, closing the modal does not remove the component */
    /* and the modified states are retained.                                                        */
    /* The MixIn function this.props.closeModal() has been replaced by this.child.closeModal(),     */
    /* which is a way to call a function defined in the child component from the parent component.  */
    /* The reference example is at: https://jsfiddle.net/frenzzy/z9c46qtv/                          */
    /************************************************************************************************/
    handleModalClose(trigger) {
        let errors = this.state.formErrors;
        errors['resourceId'] = '';
        if (!this.state.submitResourceBusy) {
            if (this.props.resourceType === 'pubmed' || (trigger && trigger === 'cancel')) {
                this.setState({formErrors: errors, inputValue: '', queryResourceDisabled: true, resourceFetched: false, tempResource: {}});
            }
            this.child.closeModal();
        }
    },

    // This lifecycle method is used to address the button UI behaviors
    // in Family curation, Individual curation and Experimental curation
    // in which this component is unmounted upon submitting the queried
    // resource of either ClinVar or CAR
    componentWillUnmount() {
        let errors = this.state.formErrors;
        errors['resourceId'] = '';
        if (this.props.resourceType === 'clinvar' || this.props.resourceType === 'car') {
            this.setState({formErrors: errors, inputValue: '', queryResourceDisabled: true, resourceFetched: false, tempResource: {}});
        }
    },

    render: function() {
        return (
            <ModalComponent modalTitle={this.props.title} modalClass="modal-default" modalWrapperClass="input-inline add-resource-id-modal"
                actuatorClass={this.props.buttonClass} actuatorTitle={this.props.buttonText} onRef={ref => (this.child = ref)}>
                <div className="form-std">
                    <div className="modal-body">
                        <Input autofocus type="text" ref="resourceId" label={this.state.txtInputLabel} handleChange={this.handleChange} value={this.state.inputValue}
                            error={this.getFormError('resourceId')} clearError={this.clrFormErrors.bind(null, 'resourceId')} submitHandler={this.submitResource}
                            labelClassName="control-label" groupClassName="resource-input" required />
                        <Input type="button-button" title={this.state.txtInputButton} inputClassName={(this.state.queryResourceDisabled ? "btn-default" : "btn-primary") + " pull-right"} clickHandler={this.queryResource} submitBusy={this.state.queryResourceBusy} inputDisabled={this.state.queryResourceDisabled}/>
                        <div className="row">&nbsp;<br />&nbsp;</div>
                        {this.state.resourceFetched ?
                        <div>
                            <p>&nbsp;<br />{this.state.txtResourceResponse}</p>
                            {this.renderResourceResult()}
                        </div>
                        : this.state.txtHelpText}
                    </div>
                    <div className='modal-footer'>
                        <Input type="button" inputClassName="btn-default btn-inline-spacer" clickHandler={this.cancelForm} title="Cancel" />
                        <Input type="button-button" inputClassName={this.getFormError('resourceId') === null || this.getFormError('resourceId') === undefined || this.getFormError('resourceId') === '' ?
                            "btn-primary btn-inline-spacer" : "btn-primary btn-inline-spacer disabled"} title={this.props.modalButtonText ? this.props.modalButtonText : "Save"} clickHandler={this.submitResource} inputDisabled={!this.state.resourceFetched} submitBusy={this.state.submitResourceBusy} />
                    </div>
                </div>
            </ModalComponent>
        );
    }
});

/*
Below are the logic and helper functions for the difference resource types.
The ___Txt() functions hold the different text that should be displayed for that resource in the modal.
The ___ValidateForm() functions hold the function that validates the input in the modal, specific to that resource.
The ___QueryResource() functions hold the primary logic for reaching out to the resource and parsing the data/handling the response,
    specific to that resource. These functions are called when the user hits the 'Retrieve'/'Edit' button in the modal
The ___RenderResourceResult() functions return the rendered html elements for the resource response
The ___SubmitResource() functions hold the primary logic for submitting the parsed resource object to the internal database,
    specific to that resource. These functions are called when the user hits the 'Submit' button on the modal, subsequently closing it.
*/

// Logic and helper functions for resource type 'pubmed' for AddResource modal
function pubmedTxt(field, extra) {
    var txt;
    if (!extra) {
        extra = '';
    }
    switch(field) {
        case 'modalTitle':
            txt = 'Add new PubMed Article';
            break;
        case 'inputLabel':
            txt = 'Enter a PMID';
            break;
        case 'editLabel':
            txt = 'Edit PMID';
            break;
        case 'inputButton':
            txt = 'Retrieve PubMed Article';
            break;
        case 'resourceResponse':
            txt = "Select \"" + extra + "\" (below) if the following citation is correct; otherwise, edit the PMID (above) to retrieve a different article.";
            break;
    }
    return txt;
}
function pubmedValidateForm() {
    // validating the field for PMIDs
    var valid = this.validateDefault();
    var formInput = this.getFormValue('resourceId');

    // Valid if input has a prefix like "PMID:" (which is removed before validation continues)
    if (valid && formInput.match(/:/)) {
        if (valid && formInput.match(/^PMID\s*:/i)) {
            formInput = formInput.replace(/^PMID\s*:\s*(\S*)$/i, '$1');

            if (!formInput) {
                valid = false;
                this.setFormErrors('resourceId', 'Please include a PMID');
                this.setState({submitBusy: false});
            }
        } else {
            valid = false;
            this.setFormErrors('resourceId', 'Invalid PMID');
            this.setState({submitBusy: false});
        }
    }

    // valid if input isn't zero-filled
    if (valid && formInput.match(/^0+$/)) {
        valid = false;
        this.setFormErrors('resourceId', 'This PMID does not exist');
        this.setState({submitBusy: false});
    }
    // valid if input isn't zero-leading
    if (valid && formInput.match(/^0+/)) {
        valid = false;
        this.setFormErrors('resourceId', 'Please re-enter PMID without any leading 0\'s');
        this.setState({submitBusy: false});
    }
    // valid if the input only has numbers
    if (valid && !formInput.match(/^[0-9]*$/)) {
        valid = false;
        this.setFormErrors('resourceId', 'PMID should contain only numbers');
        this.setState({submitBusy: false});
    }
    // valid if parent object is GDM and input isn't already associated with it
    if (valid && this.props.parentObj && this.props.parentObj['@type'] && this.props.parentObj['@type'][0] == 'gdm') {
        for (var i = 0; i < this.props.parentObj.annotations.length; i++) {
            if (this.props.parentObj.annotations[i].article.pmid == formInput) {
                valid = false;
                this.setFormErrors('resourceId', 'This article has already been associated with this Gene-Disease Record');
                this.setState({submitBusy: false});
                break;
            }
        }
    }
    // valid if parent object is evidence list (VCI) and input isn't already associated with it - final behavior TBD
    /*
    if (valid && this.props.parentObj && this.props.parentObj['@type'] && this.props.parentObj['@type'][0] == 'evidenceList') {
        for (var j = 0; j < this.props.parentObj.evidenceList.length; j++) {
            if (this.props.parentObj.evidenceList[j].articles[0].pmid == formInput) {
                valid = false;
                this.setFormErrors('resourceId', 'This article has already been associated with this evidence group');
                this.setState({submitBusy: false});
                break;
            }
        }
    }*/
    return valid;
}
function pubmedQueryResource() {
    // for pinging and parsing data from PubMed
    this.saveFormValue('resourceId', this.state.inputValue);
    if (pubmedValidateForm.call(this)) {
        var url = external_url_map['PubMedSearch'];
        var data;

        // Remove possible prefix like "PMID:" before sending queries
        var id = this.state.inputValue.replace(/^PMID\s*:\s*(\S*)$/i, '$1');
        this.getRestData('/articles/' + id).then(article => {
            // article already exists in db
            this.setState({queryResourceBusy: false, tempResource: article, resourceFetched: true});
        }, () => {
            var url = external_url_map['PubMedSearch'];
            // PubMed article not in our DB; go out to PubMed itself to retrieve it as XML
            this.getRestDataXml(external_url_map['PubMedSearch'] + id).then(xml => {
                var data = parsePubmed(xml);
                if (data.pmid) {
                    // found the result we want
                    this.setState({queryResourceBusy: false, tempResource: data, resourceFetched: true});
                } else {
                    // no result from ClinVar
                    this.setFormErrors('resourceId', 'PMID not found');
                    this.setState({queryResourceBusy: false, resourceFetched: false});
                }
            });
        }).catch(e => {
            // error handling for PubMed query
            this.setFormErrors('resourceId', 'Error querying PubMed. Please check your input and try again.');
            this.setState({queryResourceBusy: false, resourceFetched: false});
        });
    } else {
        this.setState({queryResourceBusy: false});
    }
}
function pubmedRenderResourceResult() {
    return(
        <div>
            {this.state.tempResource ?
                <div className="row">
                    <span className="col-sm-10 col-sm-offset-1"><PmidSummary article={this.state.tempResource} displayJournal pmidLinkout /></span>
                </div>
            : null}
        </div>
    );
}
function pubmedSubmitResource(func) {
    // for dealing with the main form
    this.setState({submitResourceBusy: true});
    if (this.state.tempResource) {
        this.getRestData('/search/?type=article&pmid=' + this.state.tempResource.pmid).then(check => {
            if (check.total) {
                // article already exists in our db
                this.getRestData(check['@graph'][0]['@id']).then(result => {
                    this.props.updateParentForm(result);
                });
            } else {
                // article is new to our db
                this.postRestData('/article/', this.state.tempResource).then(result => {
                    this.props.updateParentForm(result['@graph'][0]);
                });
            }
            this.setState({submitResourceBusy: false}, () => {
                return func();
            });
        });
    }
}

// Logic and helper functions for resource type 'clinvar' for AddResource modal
function clinvarTxt(field, extra) {
    // Text to use for the resource type of 'clinvar'
    var txt;
    if (!extra) {
        extra = '';
    }
    switch(field) {
        case 'modalTitle':
            txt = 'ClinVar Variant';
            break;
        case 'inputLabel':
            txt = 'Enter ClinVar VariationID';
            break;
        case 'editLabel':
            txt = 'Edit ClinVar VariationID';
            break;
        case 'inputButton':
            txt = 'Retrieve from ClinVar';
            break;
        case 'helpText':
            txt =
                <span>
                    <p className="alert alert-info">
                        <span>Enter a ClinVar VariationID. The VariationID can be found in the light blue box on a variant page (example: <a href={external_url_map['ClinVarSearch'] + '139214'} target="_blank">139214</a>).</span>
                    </p>
                </span>;
            break;
        case 'resourceResponse':
            txt = "Below are the data from ClinVar for the VariationID you submitted. Select \"" + extra + "\" below if it is the correct variant, otherwise revise your search above:";
            break;
    }
    return txt;
}
function clinvarValidateForm() {
    // validating the field for ClinVarIDs
    var valid = this.validateDefault();
    var formInput = this.getFormValue('resourceId');

    // valid if input isn't zero-filled
    if (valid && formInput.match(/^0+$/)) {
        valid = false;
        this.setFormErrors('resourceId', 'Invalid ClinVar ID');
    }
    // valid if input isn't zero-leading
    if (valid && formInput.match(/^0+/)) {
        valid = false;
        this.setFormErrors('resourceId', 'Please re-enter ClinVar ID without any leading 0\'s');

    }
    // valid if the input only has numbers
    if (valid && !formInput.match(/^[0-9]*$/)) {
        valid = false;
        this.setFormErrors('resourceId', 'Only numbers allowed');
    }
    // valid if parent object is family, individual or experimental and input isn't already associated with it
    if (valid && this.props.parentObj && this.props.parentObj['@type'] && this.props.parentObj['@type'][0] == 'variantList') {
        // loop through received variantlist and make sure that the variant is not already associated
        for (var i in this.props.parentObj.variantList) {
            // but don't check against the field it's editing against, in case it is an edit
            if (i != this.props.fieldNum && this.props.parentObj.variantList.hasOwnProperty(i)) {
                if (this.props.parentObj.variantList[i].clinvarVariantId == formInput) {
                    valid = false;
                    this.setFormErrors('resourceId', 'This variant has already been associated with this piece of ' + this.props.parentObj['@type'][1] + ' evidence.');
                    this.setState({submitBusy: false});
                    break;
                }
            }
        }
    }
    return valid;
}
function clinvarQueryResource() {
    // for pinging and parsing data from ClinVar
    console.log('clinvarQueryResource()');
    this.saveFormValue('resourceId', this.state.inputValue);
    if (clinvarValidateForm.call(this)) {
        var url = external_url_map['ClinVarEutilsVCV'];
        var data;
        var id = this.state.inputValue;
        this.getRestDataXml(url + id).then((xml) => {
            data = parseClinvar(xml, true);
            console.log('clinvar data (extended parsing)', data);
            if (data.clinvarVariantId) {
                // found the result we want

                // try to query MANE transcript title as well (based on CAR), even if ClinVar title will always be favored for displaying variant title; MANE transcript title will have other use due to unique status of MANE.

                return queryAdditionalTranscriptTitles({
                    getRestData: this.getRestData,
                    matchBySource: 'clinvar',
                    parsedData: data
                })
                    .then((additionalTranscriptTitles) => {
                        Object.assign(data, additionalTranscriptTitles);
                        console.log('store state (w/ mane)', data);
                        return;
                    })
                    .catch((error) => {
                        console.warn('Error in querying MANE transcript data = %o', error);
                        // best effort to get MANE so just move on
                        return Promise.resolve();
                    })
                .then(() => {
                    this.setState({queryResourceBusy: false, tempResource: data, resourceFetched: true});
                });
            } else {
                // no result from ClinVar
                this.setFormErrors('resourceId', 'ClinVar ID not found');
                this.setState({queryResourceBusy: false, resourceFetched: false});
            }
        })
        .catch(e => {
            console.log('error', e);
            // error handling for ClinVar query
            this.setFormErrors('resourceId', 'Error querying ClinVar. Please check your input and try again.');
            this.setState({queryResourceBusy: false, resourceFetched: false});
        });
    } else {
        this.setState({queryResourceBusy: false});
    }
}
function clinvarSubmitResource(func) {
    // for dealing with the main form
    this.setState({submitResourceBusy: true});
    if (this.state.tempResource.clinvarVariantId) {
        this.getRestData('/search/?type=variant&clinvarVariantId=' + this.state.tempResource.clinvarVariantId).then(check => {
            if (check.total) {
                // variation already exists in our db
                this.getRestData(check['@graph'][0]['@id']).then(result => {
                    // Compare variant data properties
                    // Existing variants in production db will be identified if any of data property below (except clinvarVariantTitle) has value at set retrieved from ClinVar API but not have value in db
                    // In this case, save ClinVar data into the variant.
                    if ((!result['clinvarVariantTitle'].length || result['clinvarVariantTitle'] !== this.state.tempResource['clinvarVariantTitle'])
                        || (this.state.tempResource['carId'] !== result['carId'])
                        || (this.state.tempResource['maneTranscriptTitle'] !== result['maneTranscriptTitle'])
                        || (this.state.tempResource['dbSNPIds'] && this.state.tempResource['dbSNPIds'].length && (!result['dbSNPIds'] || (result['dbSNPIds'] && !result['dbSNPIds'].length)))
                        || (this.state.tempResource['hgvsNames'] && Object.keys(this.state.tempResource['hgvsNames']).length &&
                            ((!result['hgvsNames'] || (result['hgvsNames'] && !Object.keys(result['hgvsNames']).length))
                            || (this.state.tempResource['hgvsNames']['GRCh37'] && !result['hgvsNames']['GRCh37'])
                            || (this.state.tempResource['hgvsNames']['GRCh38'] && !result['hgvsNames']['GRCh38'])))
                        || (this.state.tempResource['variationType'] && !result['variationType'])
                        || (this.state.tempResource['molecularConsequenceList'] && Object.keys(this.state.tempResource['molecularConsequenceList']).length && (!result['molecularConsequenceList'] || !Object.keys(!result['molecularConsequenceList'].length)))
                        || (this.state.tempResource['otherNameList'] && this.state.tempResource['otherNameList'].length && (!result['otherNameList'] || (result['otherNameList'] && !result['otherNameList'].length)))
                        ) {
                        this.putRestData('/variants/' + result['uuid'], this.state.tempResource).then(result => {
                            return this.getRestData(result['@graph'][0]['@id']).then(result => {
                                this.props.updateParentForm(result, this.props.fieldNum);
                            });
                        });
                    } else {
                        this.props.updateParentForm(result, this.props.fieldNum);
                    }
                });
            } else {
                // variation is new to our db
                this.postRestData('/variants/', this.state.tempResource).then(result => {
                    // record the user adding a new variant entry
                    this.recordHistory('add', result['@graph'][0]).then(history => {
                        this.props.updateParentForm(result['@graph'][0], this.props.fieldNum);
                    });
                });
            }
            this.setState({submitResourceBusy: false}, () => {
                return func();
            });
        });
    }
}

// Logic and helper functions for resource type 'car' for AddResource modal
function carTxt(field, extra) {
    // Text to use for the resource type of 'car'
    var txt;
    if (!extra) {
        extra = '';
    }
    switch(field) {
        case 'modalTitle':
            txt = 'ClinGen Allele Registry';
            break;
        case 'inputLabel':
            txt = 'Enter CA ID';
            break;
        case 'editLabel':
            txt = 'Edit CA ID';
            break;
        case 'inputButton':
            txt = 'Retrieve from ClinGen Allele Registry';
            break;
        case 'helpText':
            txt =
                <span>
                    <p className="alert alert-info">
                        <span>Enter a ClinGen Allele Registry ID (CA ID). The CA ID is returned when you register an allele with the ClinGen Allele Registry (example: <a href={`http:${external_url_map['CARallele']}CA003323.html`} target="_blank">CA003323</a>).</span>
                    </p>
                </span>;
            break;
        case 'resourceResponse':
            txt = "Below are the data from the ClinGen Allele Registry for the CA ID you submitted. Select \"" + extra + "\" below if it is the correct variant, otherwise revise your search above:";
            break;
    }
    return txt;
}
function carValidateForm() {
    // validating the field for CA IDs
    var valid = this.validateDefault();
    var formInput = this.getFormValue('resourceId');

    // valid if the input begins with 'CA', followed by 6 numbers
    if (valid && !formInput.match(/^CA[0-9]+$/)) {
        valid = false;
        this.setFormErrors('resourceId', 'Invalid CA ID');
    }

    // valid if parent object is family, individual or experimental and input isn't already associated with it
    if (valid && this.props.parentObj && this.props.parentObj['@type'] && this.props.parentObj['@type'][0] == 'variantList') {
        // loop through received variantlist and make sure that the variant is not already associated
        for (var i in this.props.parentObj.variantList) {
            // but don't check against the field it's editing against, in case it is an edit
            if (i != this.props.fieldNum && this.props.parentObj.variantList.hasOwnProperty(i)) {
                if (this.props.parentObj.variantList[i].carId == formInput) {
                    valid = false;
                    this.setFormErrors('resourceId', 'This variant has already been associated with this piece of ' + this.props.parentObj['@type'][1] + ' evidence.');
                    this.setState({submitBusy: false});
                    break;
                }
            }
        }
    }
    return valid;
}
function carQueryResource() {
    // for pinging and parsing data from CAR
    this.saveFormValue('resourceId', this.state.inputValue);
    if (carValidateForm.call(this)) {
        var url = this.props.protocol + external_url_map['CARallele'];
        var data;
        var id = this.state.inputValue;
        this.getRestData(url + id).then((json) => new Promise((carApiCallResolve, carApiCallReject) => {
            // final state values after query; default to nothing happened
            let finalState = {
                queryResourceBusy: false,
                resourceFetched: true
            }

            console.log('CAR raw res', json);

            data = parseCAR(json);

            console.log('CAR parsed data', data);

            finalState.tempResource = data;
            
            // patch data `finalState.tempResource` based on CAR API call data `json`
            if (data.clinvarVariantId) {
                // if the CAR result has a ClinVar variant ID, query ClinVar with it, and use its data
                url = external_url_map['ClinVarEutilsVCV'];
                return this.getRestDataXml(url + data.clinvarVariantId).then((xml) => {
                    var data_cv = parseClinvar(xml);
                    if (data_cv.clinvarVariantId) {
                        // found the result we want
                        data_cv.carId = id;
                        finalState.tempResource = data_cv;
                    } else {
                        // something failed with the parsing of ClinVar data; roll back to CAR data (just use initial value of `finalState`)
                    }

                    return carApiCallResolve(finalState);
                }).catch((e) => {
                    // error handling for ClinVar query

                    // even if we are initially querying CAR, since Clinvar API does not 
                    // recognize `data.clinvarVariantId`, this field is corrupted
                    // and it's likely that other fields in CAR data are corrupted as well
                    // so we don't want to proceed
                    return carApiCallReject(new Error('Error querying ClinVar for additional data. Please check your input and try again.'));
                })
            } else if (data.carId) {
                // if the CAR result has no ClinVar variant ID, just use the CAR data set
                let hgvs_notation = getHgvsNotation(data, 'GRCh38', true);
                let request_params = '?content-type=application/json&hgvs=1&protein=1&xref_refseq=1&ExAC=1&MaxEntScan=1&GeneSplicer=1&Conservation=1&numbers=1&domains=1&canonical=1&merged=1';

                console.log('hitting ensembl url:', this.props.protocol + external_url_map['EnsemblHgvsVEP'] + hgvs_notation + request_params), '...';
                
                if (false) {
                    return this.getRestData(this.props.protocol + external_url_map['EnsemblHgvsVEP'] + hgvs_notation + request_params).then((response) => {

                        console.log('ensembl data:', response);
                        
                        let ensemblTranscripts = response.length && response[0].transcript_consequences ? response[0].transcript_consequences : [];
                        if (ensemblTranscripts && ensemblTranscripts.length) {
                            let canonicalTranscript = getCanonicalTranscript(ensemblTranscripts);
                            if (canonicalTranscript && canonicalTranscript.length && data.tempAlleles && data.tempAlleles.length) {
                                data.tempAlleles.forEach(item => {
                                    if (item.hgvs && item.hgvs.length) {
                                        for (let transcript of item.hgvs) {
                                            if (transcript === canonicalTranscript) {
                                                let proteinChange;
                                                let transcriptStart = transcript.split(':')[0];
                                                let transcriptEnd = transcript.split(':')[1];
                                                if (item.proteinEffect && item.proteinEffect.hgvs) {
                                                    proteinChange = item.proteinEffect.hgvs.split(':')[1];
                                                }
                                                console.log('assigning canonical transcript using previous ensembl');
                                                data['canonicalTranscriptTitle'] = `${transcriptStart}(${item.geneSymbol}):${transcriptEnd}${proteinChange ? ` (${proteinChange})` : ''}`;
                                                // delete data['tempAlleles'];
                                            }
                                        }
                                    }
                                });
                            }
                            console.log('previous canonical logic result', data);
                            // Remove the 'tempAlleles' object at this point regardless
                            // whether the preceding evaluations are executed
                            // if (data['tempAlleles']) delete data['tempAlleles'];
                        } else {
                            // Fall back to CAR data without the canonical transcript title if there is no ensembl transcript
                            // if (data['tempAlleles']) delete data['tempAlleles'];
                        }
                        
                        return carApiCallResolve(finalState);
                    })
                    .catch (err => {
                        // Error in VEP get request
                        console.warn('Error in querying Ensembl VEP data = %o', err);
                        // Fall back to CAR data
                        // if (data['tempAlleles']) delete data['tempAlleles'];
                        
                        return carApiCallResolve(finalState);
                    });
                } else {
                    // Fall back to CAR data without the canonical transcript title if parsing fails
                    // if (data['tempAlleles']) delete data['tempAlleles'];
                }
            } else {
                // in case the above two fail (theoretically a 404 json response, but an error is thrown instead (see below))

                // no need to `delete finalState['tempResource']` here as we are discarding
                // the entire query result and in the catch callback below
                // we will not check in any data into local state
                return carApiCallReject(new Error('CA ID not found'));
            }

            // // update all the state once here to ensure state update occurs at the end
            // this.setState(finalState);
            return carApiCallResolve(finalState);
        })
            .then((finalState) => {
                // If queried CAR successfully, always try to obtain MANE transcript info (best effort only)
                // Looking up MANE requires CAR since LDH only has id of transcript at this point, so have to join detail data from CAR
                if (finalState.resourceFetched) {
                    return queryAdditionalTranscriptTitles({
                        getRestData: this.getRestData, 
                        matchBySource: 'car',
                        carRawJson: json, 
                        parsedData: data
                    }).then((additionalTranscriptTitles) => {
                        const mergedTempResource = Object.assign({}, finalState.tempResource, additionalTranscriptTitles);
                        finalState.tempResource = mergedTempResource;
                        return finalState;
                    }).catch((error) => {
                        console.warn('Error in querying MANE transcript data = %o', error);

                        // The Promise returned by catch() is rejected if we throw error here or return a alraedy-rejected-Promise; otherwise, it is resolved. We want to resolve and move on here, since we query additional transcript titles only by best effort.
                        return finalState;
                    })
                }

                console.warn('CAR not available, will not fetch MANE');
                
                return finalState;
            })
        // update all the state once here to ensure state update occurs at the end
        ).then((finalState) => {
            // `parseCAR()` generates bi-product `tempAlleles` which is useful for querying
            // additional transcript titles, but should not be checked in to state
            if (finalState.tempResource['tempAlleles']) {
                delete finalState.tempResource['tempAlleles'];
            }
            console.log('final store state', finalState);
            this.setState(finalState);
        })
        .catch(e => {
            console.error(e);
            // error handling for CAR query
            if (e.status == 404 || (e.message && e.message === 'CA ID not found')) {
                this.setFormErrors('resourceId', 'CA ID not found');
            } else if (e.message) {
                this.setFormErrors('resourceId', e.message);
            } else {
                this.setFormErrors('resourceId', 'Error querying the ClinGen Allele Registry. Please check your input and try again.');
            }
            this.setState({queryResourceBusy: false, resourceFetched: false});
        });
    } else {
        this.setState({queryResourceBusy: false});
    }
}
function clinvarAndCarRenderResourceResult() {
    return(
        <div className="resource-metadata">
            <span className="p-break">{this.state.tempResource.clinvarVariantTitle}</span>
            {this.state.tempResource ?
                <div className="row">
                    {this.state.tempResource.carId ?
                        <div className="row">
                            <span className="col-xs-4 col-md-4 control-label"><label>CA ID</label></span>
                            <span className="col-xs-8 col-md-8 text-no-input"><a href={`${this.props.protocol}${external_url_map['CARallele']}${this.state.tempResource.carId}.html`} target="_blank"><strong>{this.state.tempResource.carId}</strong></a></span>
                        </div>
                        : null}
                    {this.state.tempResource.clinvarVariantId ?
                        <div className="row">
                            <span className="col-xs-4 col-md-4 control-label"><label>ClinVar Variant ID</label></span>
                            <span className="col-xs-8 col-md-8 text-no-input"><a href={`${external_url_map['ClinVarSearch']}${this.state.tempResource.clinvarVariantId}`} target="_blank"><strong>{this.state.tempResource.clinvarVariantId}</strong></a></span>
                        </div>
                        : null}
                    {this.state.tempResource.hgvsNames ?
                        <div className="row">
                            <span className="col-xs-4 col-md-4 control-label"><label>HGVS terms</label></span>
                            <span className="col-xs-8 col-md-8 text-no-input">
                                {variantHgvsRender(this.state.tempResource.hgvsNames)}
                            </span>
                        </div>
                        : null}
                </div>
                : null}
        </div>
    );
}
function carSubmitResource(func) {
    // for dealing with the main form
    this.setState({submitResourceBusy: true});
    if (this.state.tempResource.clinvarVariantId || this.state.tempResource.carId) {
        var internal_uri;
        if (this.state.tempResource.clinvarVariantId) {
            internal_uri = '/search/?type=variant&clinvarVariantId=' + this.state.tempResource.clinvarVariantId;
        } else if (this.state.tempResource.carId) {
            internal_uri = '/search/?type=variant&carId=' + this.state.tempResource.carId;
        }
        this.getRestData(internal_uri).then(check => {
            if (check.total) {
                // variation already exists in our db
                this.getRestData(check['@graph'][0]['@id']).then(result => {
                    // if no variant title in db, or db's variant title not matching the retrieved title,
                    // then update db and fetch result again
                    if (!result['clinvarVariantTitle'].length
                        || result['clinvarVariantTitle'] !== this.state.tempResource['clinvarVariantTitle'] 
                        || result['carId'] !== this.state.tempResource['carId']
                        || result['maneTranscriptTitle'] !== this.state.tempResource['maneTranscriptTitle']) {
                        this.putRestData('/variants/' + result['uuid'], this.state.tempResource).then(result => {
                            return this.getRestData(result['@graph'][0]['@id']).then(result => {
                                this.props.updateParentForm(result, this.props.fieldNum);
                            });
                        });
                    } else {
                        this.props.updateParentForm(result, this.props.fieldNum);
                    }
                });
            } else {
                // variation is new to our db
                this.postRestData('/variants/', this.state.tempResource).then(result => {
                    // record the user adding a new variant entry
                    this.recordHistory('add', result['@graph'][0]).then(history => {
                        this.props.updateParentForm(result['@graph'][0], this.props.fieldNum);
                    });
                });
            }
            this.setState({submitResourceBusy: false}, () => {
                return func();
            });
        });
    }
}

/**
 * Extracts and returns the variant MANE & canonical transcript title from CAR response data
 * @param {Object} props Argument object for this method
 * @param {Function} props.getRestData The api call GET utility function.
 * @param {'clinvar'|'car'} props.matchBySource Variant data source, either 
 * @param {Object|undefined|null} props.carRawJson The returned variant response data from CAR API call. Required when soruce is 'car'.
 * @param {Object|undefined|null} props.parsedData The parsed data originated from either Clinvar or CAR.
 * @returns {Promise<{ maneTranscriptTitle?: string, canonicalTranscriptTitle?: string }>} The object containing each transcript title
 */
function queryAdditionalTranscriptTitles({
    getRestData, matchBySource, carRawJson, parsedData
}) {
    console.log('queryManeTranscriptTitle()');
    console.log('parsedData', parsedData);

    // Validate parameters

    if (!(parsedData && getRestData)) {
        console.warn(`pasrsedData or getRestData not provided`);
        return Promise.resolve({});
    }
    if (!(matchBySource === 'car' || matchBySource === 'clinvar')) {
        console.warn(`source not correctly set`);
        return Promise.resolve({});
    }
    if (matchBySource === 'car' && !carRawJson) {
        console.warn('source is CAR but carRawJson is empty');
        return Promise.resolve({});
    }

    // Lookup gene

    // collect genes from transcript
    const geneList = matchBySource === 'car' ? 
        Array.from(getTranscriptAllelesGeneSymbolSet(carRawJson.transcriptAlleles)) :
        parsedData.gene && parsedData.gene.symbol ?
            [parsedData.gene.symbol] : [];

    console.log('geneList', geneList);

    // if no gene, or 2 or more than 2 genes, then just abort and don't fetch MANE for variant title
    if (geneList.length != 1) {
        console.warn('More than 2 genes detected, will not query additional transcript titles.', geneList);
        return Promise.resolve({});
    }

    // extract hgvs_notation

    // if the CAR result has no ClinVar variant ID, just use the CAR data set
    const hgvs_notation = getHgvsNotation(parsedData, 'GRCh38', true);

    console.log('hgvs_notation', hgvs_notation);

    // query ensembl

    const request_params = '?content-type=application/json&hgvs=1&protein=1&xref_refseq=1&ExAC=1&MaxEntScan=1&GeneSplicer=1&Conservation=1&numbers=1&domains=1&mane=1&canonical=1&merged=1';
    console.log('ensembl url:', external_url_map['EnsemblHgvsVEP'] + hgvs_notation + request_params);
    if (hgvs_notation) {
        return getRestData(external_url_map['EnsemblHgvsVEP'] + hgvs_notation + request_params).then((ensemblResp) => {
            console.log('ensembl data:', ensemblResp);

            const [{
                transcript_consequences = []
            } = {}] = ensemblResp;

            const resultTitles = {};

            const maneTranscriptTitle = getManeTranscriptTitleFromEnsemblTranscripts({
                transcript_consequences,
                geneSymbol: geneList[0],
                matchBySource,
                carRawJson
            });
            if (maneTranscriptTitle) {
                resultTitles.maneTranscriptTitle = maneTranscriptTitle;
            }

            const canonicalTranscriptTitle = getCanonicalTranscriptTitleFromEnsemblTranscripts({
                transcript_consequences,
                matchBySource,
                parsedData
            });
            if (canonicalTranscriptTitle) {
                resultTitles.canonicalTranscriptTitle = canonicalTranscriptTitle;
            }

            return resultTitles;
        });
    }

    console.warn('no hgvs_notation, so did not query ensembl', hgvs_notation);

    return Promise.resolve({});
}
