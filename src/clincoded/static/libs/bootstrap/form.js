"use strict";
// Use this module when you have a form with input fields and an optional submit button.
// It supplies an Input component used for all types of form fields (e.g. text fields,
// drop-downs, etc.). The component that includes the form must also include the InputMixin
// mixin that handles standard form things like saving and retrieving form values, and
// handling validation errors.

import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import createReactClass from 'create-react-class';

var _ = require('underscore');


// Surround Input elements with the Form element
var Form = module.exports.Form = createReactClass({
    // Add 'id' property to any Input elements. Make it a copy of the Input's ref. Run through all children
    // of the form, and any children of those children, recursively.
    createInputRefs: function(children) {
        var processedChildren = React.Children.map(children, child => {
            if (child) {
                var props = {};

                // Copy ref to new id property.
                if (child.ref) {
                    props.id = child.ref;
                }

                // If the current child has children, process them recursively and assign the result to the new children property
                if (child.props && child.props.children) {
                    props.children = this.createInputRefs(child.props.children);
                }

                // If we made new properties, clone the child and assign the properties to the clone
                return Object.keys(props).length ? React.cloneElement(child, props) : child;
            }
            return null;

        });
        return processedChildren;
    },

    render: function() {
        // Before rendering, copy any refs on any elements in the form to each element's id property
        var children = this.createInputRefs(this.props.children);
        return (
            <form onSubmit={this.props.submitHandler} className={this.props.formClassName}>
                {children}
            </form>
        );
    }
});


var FormMixin = module.exports.FormMixin = {
    formValues: {},

    // Do not call; called by React.
    getInitialState: function() {
        this.formValues = {};
        return {formErrors: {}};
    },

    // Retrieves the saved value of the Input with the given 'ref' value. saveFormValue
    // must already have been called with this Input's value.
    getFormValue: function(ref) {
        return this.formValues[ref];
    },

    // Return an object with all form values
    getAllFormValues: function() {
        return this.formValues;
    },

    // Retrieves the saved value of the Input with the given 'ref' value, and the Input
    // value must be numeric. If the Input had no entered value at all, the empty string is
    // returned. If the Input had an entered value but it wasn't numeric, null is returned.
    // If the Input had a proper numberic value, a Javascript 'number' type is returned
    // with the entered value.
    getFormValueNumber: function(ref) {
        var value = this.getFormValue(ref);
        if (value) {
            var numericValue = value.match(/^\s*(\d*)\s*$/);
            if (numericValue) {
                return parseInt(numericValue[1], 10);
            }
            return null;
        }
        return '';
    },

    // Normally used after the submit button is clicked. Call this to save the value
    // from the Input with the given 'ref' value and the value itself. This does
    // NOT modify the form input values; it just saves them for later processing.
    saveFormValue: function(ref, value) {
        this.formValues[ref] = value;
    },

    // Call this to avoid calling 'saveFormValue' for every form item. It goes through all the
    // form items with refs (should be all of them) and saves a formValue property with the
    // corresponding value from the DOM.
    saveAllFormValues: function() {
        if (this.refs && Object.keys(this.refs).length) {
            Object.keys(this.refs).map(ref => {
                this.saveFormValue(ref, this.refs[ref].getValue());
            });
        }
    },

    resetAllFormValues: function() {
        if (this.refs && Object.keys(this.refs).length) {
            Object.keys(this.refs).map(ref => {
                this.refs[ref].resetValue();
            });
        }
        this.formValues = {};
    },

    // Get the saved form error for the Input with the given 'ref' value.
    getFormError: function(ref) {
        return this.state.formErrors[ref];
    },

    // Save a form error for the given Input's 'ref' value for later retrieval with getFormError.
    // The message that should be displayed to the user is passed in 'msg'.
    setFormErrors: function(ref, msg) {
        var formErrors = this.state.formErrors;
        formErrors[ref] = msg;
        this.setState({formErrors: formErrors});
    },

    // Clear error state from the Input with the given 'ref' value. This should be passed to
    // Input components in the 'clearError' property so that it can be called when an Input's
    // value changes.
    clrFormErrors: function(ref) {
        var errors = this.state.formErrors;
        errors[ref] = '';
        this.setState({formErrors: errors});
    },

    // Clear errors at multiple Inputs at the same time
    // When data entered in one Input, error messages in all related Inputs will be cleared.
    clrMultiFormErrors: function(refs) {
        var errors = this.state.formErrors;
        refs.forEach(function(ref){
            errors[ref] = '';
        });
        this.setState({formErrors: errors});
    },

    // clears errors form all form inputs
    clrAllFormErrors: function() {
        var errors = this.state.formErrors;
        if (this.refs && Object.keys(this.refs).length) {
            Object.keys(this.refs).map(ref => {
                errors[ref] = '';
            });
        }
        this.setState({formErrors: errors});
    },

    // Return true if the form's current state shows any Input errors. Return false if no
    // errors are indicated. This should be called in the render function so that the submit
    // form function will have had a chance to record any errors.
    anyFormErrors: function() {
        var formErrors = Object.keys(this.state.formErrors);

        if (formErrors.length) {
            return _(formErrors).any(errKey => {
                return this.state.formErrors[errKey];
            });
        }
        return false;
    },

    // Do form validation on the required fields. Each field checked must have a unique ref,
    // and the boolean 'required' field set if it's required. All the Input's values must
    // already have been collected with saveFormValue. Returns true if all required fields
    // have values, or false if any do not. It also sets any empty required Inputs error
    // to the 'Required' message so it's displayed on the next render.
    validateDefault: function() {
        var valid = true;
        Object.keys(this.refs).forEach(ref => {
            var props = this.refs[ref].props;
            var val = this.getFormValue(ref);
            val = (props.type === 'select' && val === 'none') ? null : val;
            if (props.required && !val) {
                // Required field has no value. Set error state to render
                // error, and remember to return false.
                this.setFormErrors(ref, props.customErrorMsg ? props.customErrorMsg : 'Required');
                valid = false;
            } else if (props.type === 'number') {
                // Validate that type="number" fields have a valid number in them
                var numVal = this.getFormValueNumber(ref);
                if (numVal === null) {
                    if (props.inputClassName && props.inputClassName.indexOf('integer-only') > -1) {
                        this.setFormErrors(ref, 'Non-decimal values only');
                        valid = false;
                    } else if (!this.getFormValue(ref).match(/^\d+\.\d+$/)) {
                        this.setFormErrors(ref, 'Number only');
                        valid = false;
                    }
                } else if (numVal !== '' && ((props.minVal && numVal < props.minVal) || (props.maxVal && numVal > props.maxVal))) {
                    valid = false;
                    if (props.minVal && props.maxVal) {
                        this.setFormErrors(ref, 'The range of allowed values is ' + props.minVal + ' to ' + props.maxVal);
                    } else if (props.minVal) {
                        this.setFormErrors(ref, 'The minimum allowed value is ' + props.minVal);
                    } else {
                        this.setFormErrors(ref, 'The maximum allowed value is ' + props.maxVal);
                    }
                }
            }
        });
        return valid;
    }
};


// Handles most form inputs, like text fields and dropdowns. The different Bootstrap styles of
// inputs can be handled through the labelClassName, groupClassName, and wrapperClassName properties.
var Input = module.exports.Input = createReactClass({
    propTypes: {
        type: PropTypes.string.isRequired, // Type of input
        label: PropTypes.oneOfType([ // <label> for input
            PropTypes.string,       // Just a string
            PropTypes.object,       // Another React component
            PropTypes.array,        // Some JSX
            PropTypes.element       // Some JSX
        ]),
        hasModal: PropTypes.bool,
        inputGroupBtn: PropTypes.oneOfType([ // <button> for input-group
            PropTypes.string,
            PropTypes.object
        ]),
        helpText: PropTypes.oneOfType([ // <p> help text beneath the text input field
            PropTypes.string,
            PropTypes.object
        ]),
        helpTextId: PropTypes.string, // <p> help text element id; required if 'helpText' props is used
        placeholder: PropTypes.string, // <input> placeholder text
        maxLength: PropTypes.string, // maxlength for labels
        error: PropTypes.string, // Error message to display below input
        labelClassName: PropTypes.string, // CSS classes to add to labels
        groupClassName: PropTypes.string, // CSS classes to add to control groups (label/input wrapper div)
        wrapperClassName: PropTypes.string, // CSS classes to add to wrapper div around inputs
        inputClassName: PropTypes.string, // CSS classes to add to input elements themselves
        rows: PropTypes.string, // Number of rows in textarea
        value: PropTypes.oneOfType([ // Value to pre-fill input with
            PropTypes.string,
            PropTypes.number
        ]),
        controlledValue: PropTypes.string, // Value used if input field does not use ref
        defaultValue: PropTypes.string, // Default value for <select>
        required: PropTypes.bool,       // T to make this a required field
        clickHandler: PropTypes.func,   // Called to handle button click
        submitHandler: PropTypes.func,  // Called to handle submit button click
        cancelHandler: PropTypes.func,  // Called to handle cancel button click
        submitBusy: PropTypes.bool,     //
        onBlur: PropTypes.func,
        giveFocus: PropTypes.bool,
        minVal: PropTypes.number,       // Minimum value for a number formatted input
        maxVal: PropTypes.number,       // Maximum value for a number formatted input
        key: PropTypes.string,          // Passed to react if this is part of a list of inputs
        inputDisabled: PropTypes.bool,  // If we should disable the input
        handleChange: PropTypes.func,   // Function to handle a change in the input, akin to onChange
        fieldStyle: PropTypes.object,    // Any custom in-line styles to attatch to the input field
        autofocus: PropTypes.bool
    },

    getInitialState: function() {
        return {value: this.props.value};
    },

    componentDidMount: function() {
        if (this.refs.input && this.props.giveFocus) {
            this.refs.input.focus();
        }
    },

    // Get the text the user entered from the text-type field. Meant to be called from
    // parent components.
    getValue: function() {
        if (this.props.type === 'text' || this.props.type === 'email' || this.props.type === 'number' || this.props.type === 'textarea') {
            return ReactDOM.findDOMNode(this.refs.input).value.trim();
        } else if (this.props.type === 'select') {
            return this.getSelectedOption().trim();
        } else if (this.props.type === 'checkbox') {
            return this.props.checked;
        }
    },

    // Toggles value for checkboxes
    toggleValue: function() {
        if (this.props.type === 'checkbox') {
            if (this.props.checked === true) {
                return false;
            }
            else {
                return true;
            }
        }
    },

    // Set the value of an input
    setValue: function(val) {
        if (this.props.type === 'text' || this.props.type === 'email' || this.props.type === 'textarea' || this.props.type === 'number') {
            ReactDOM.findDOMNode(this.refs.input).value = val;
            this.setState({value: val});
        } else if (this.props.type === 'select') {
            this.setSelectedOption(val);
        } else if (this.props.type === 'checkbox') {
            ReactDOM.findDOMNode(this.refs.input).checked = val;
            this.setState({value: val});
        } else if (this.props.type === 'input-group') {
            ReactDOM.findDOMNode(this.refs.targetInput).value = val;
            this.setState({value: val});
        }
    },

    resetValue: function() {
        if (this.props.type === 'text' || this.props.type === 'email' || this.props.type === 'textarea') {
            ReactDOM.findDOMNode(this.refs.input).value = '';
        } else if (this.props.type === 'select') {
            this.resetSelectedOption();
        } else if (this.props.type === 'checkbox') {
            this.resetSelectedCheckbox();
        } else if (this.props.type === 'input-group') {
            ReactDOM.findDOMNode(this.refs.targetInput).value = '';
        }
    },

    // Reset <select> to default option
    resetSelectedOption: function() {
        var selectNode = this.refs.input;
        var optionNodes = selectNode.getElementsByTagName('option');
        if (optionNodes && optionNodes.length) {
            selectNode.value = optionNodes[0].value;
        }
    },

    // Reset checkbox
    resetSelectedCheckbox: function() {
        var selectNode = this.refs.input;
        selectNode.checked = false;
    },

    setSelectedOption: function(val) {
        var select = this.refs.input;
        select.value = val;
    },

    // Get the selected option from a <select> list
    getSelectedOption: function() {
        var optionNodes = this.refs.input.getElementsByTagName('option');

        // Get the DOM node for the selected <option>
        var selectedOptionNode = _(optionNodes).find(function(option) {
            return option.selected;
        });

        // Get the selected options value, or its text if it has no value
        if (selectedOptionNode) {
            var valAttr = selectedOptionNode.getAttribute('value');
            return valAttr === null ? selectedOptionNode.innerHTML : valAttr;
        }

        // Nothing selected
        return '';
    },

    // Called when any input's value changes from user input
    handleChange: function(ref, e) {
        this.setState({value: e.target.value});
        if (this.props.clearError) {
            this.props.clearError();
        }
        if (this.props.handleChange) {
            this.props.handleChange(ref, e);
        }
    },

    render: function() {
        var input, inputClasses, title;
        var groupClassName = 'form-group' + this.props.groupClassName ? ' ' + this.props.groupClassName : '';

        switch (this.props.type) {
            case 'text':
            case 'email':
            case 'number':
                var inputType = this.props.type === 'number' ? 'text' : this.props.type;
                inputClasses = 'form-control' + (this.props.error ? ' error' : '') + (this.props.inputClassName ? ' ' + this.props.inputClassName : '');
                var innerInput = (
                    <span>
                        <input className={inputClasses} type={inputType} id={this.props.id} name={this.props.id} placeholder={this.props.placeholder}
                            ref="input" value={this.state.value} onChange={this.handleChange.bind(null, this.props.id)} onBlur={this.props.onBlur} maxLength={this.props.maxLength}
                            disabled={this.props.inputDisabled} aria-describedby={this.props.helpText ? this.props.helpTextId : null}  autoFocus={this.props.autofocus}
                            style={this.props.fieldStyle}
                            />
                        {this.props.helpText ? <p id={this.props.helpTextId} className="form-text text-muted">{this.props.helpText}</p> : null}
                        <div className="form-error">{this.props.error ? <span>{this.props.error}</span> : <span>&nbsp;</span>}</div>
                    </span>
                );
                input = (
                    <div className={this.props.groupClassName}>
                        {this.props.label ? <label htmlFor={this.props.id} className={this.props.labelClassName}><span>{this.props.label}{this.props.required ? <span className="required-field"> *</span> : null}</span></label> : null}
                        {this.props.wrapperClassName ? <div className={this.props.wrapperClassName}>{innerInput}</div> : <span>{innerInput}</span>}
                    </div>
                );
                break;

            case 'select':
                inputClasses = 'form-control' + (this.props.error ? ' error' : '') + (this.props.inputClassName ? ' ' + this.props.inputClassName : '');
                input = (
                    <div className={this.props.groupClassName}>
                        {this.props.label ? <label htmlFor={this.props.id} className={this.props.labelClassName}><span>{this.props.label}{this.props.required ? <span className="required-field"> *</span> : null}</span></label> : null}
                        <div className={this.props.wrapperClassName}>
                            <select className={inputClasses} ref="input" onChange={this.handleChange.bind(null, this.props.id)} onBlur={this.props.onBlur}
                            defaultValue={this.props.hasOwnProperty('value') ? this.props.value : this.props.defaultValue} disabled={this.props.inputDisabled}
                            style={this.props.fieldStyle} >
                                {this.props.children}
                            </select>
                            <div className="form-error">{this.props.error ? <span>{this.props.error}</span> : <span>&nbsp;</span>}</div>
                        </div>
                    </div>
                );
                break;

            case 'textarea':
                inputClasses = 'form-control' + (this.props.error ? ' error' : '') + (this.props.inputClassName ? ' ' + this.props.inputClassName : '');
                input = (
                    <div className={this.props.groupClassName}>
                        {this.props.label ? <label htmlFor={this.props.id} className={this.props.labelClassName}><span>{this.props.label}{this.props.required ? <span className="required-field"> *</span> : null}</span></label> : null}
                        <div className={this.props.wrapperClassName}>
                            <textarea className={inputClasses} id={this.props.id} name={this.props.id} ref="input" defaultValue={this.props.value} value={this.props.controlledValue}
                            placeholder={this.props.placeholder} onChange={this.handleChange.bind(null, this.props.id)} onBlur={this.props.onBlur} disabled={this.props.inputDisabled}
                            rows={this.props.rows} style={this.props.fieldStyle} />
                            <div className="form-error">{this.props.error ? <span>{this.props.error}</span> : <span>&nbsp;</span>}</div>
                        </div>
                    </div>
                );
                break;

            case 'text-range':
                input = (
                    <div className={this.props.groupClassName}>
                        {this.props.label ? <label className={this.props.labelClassName}><span>{this.props.label}{this.props.required ? <span className="required-field"> *</span> : null}</span></label> : null}
                        <div className={this.props.wrapperClassName}>
                            {this.props.children}
                        </div>
                    </div>
                );
                break;

            case 'button':
                // Requires properties:
                //   title: Label to put into button
                //   clickHandler: Method to call when button is clicked
                inputClasses = 'btn' + (this.props.inputClassName ? ' ' + this.props.inputClassName : '') + (this.props.submitBusy ? ' submit-busy' : '');
                input = (
                    <span className={this.props.wrapperClassName}>
                        <input className={inputClasses} type={this.props.type} value={this.props.title} onClick={this.props.clickHandler} 
                        disabled={this.props.inputDisabled || this.props.submitBusy} style={this.props.fieldStyle} />
                    </span>
                );
                break;

            case 'button-button':
                // Requires properties:
                //   title: Label to put into button
                //   clickHandler: Method to call when button is clicked
                inputClasses = 'btn' + (this.props.inputClassName ? ' ' + this.props.inputClassName : '') + (this.props.submitBusy ? ' submit-busy' : '');
                input = (
                    <span className={this.props.wrapperClassName}>
                        <button className={inputClasses} onClick={this.props.clickHandler} disabled={this.props.inputDisabled || this.props.submitBusy}
                        style={this.props.fieldStyle} >
                        {this.props.submitBusy ? <span className="submit-spinner"><i className="icon icon-spin icon-cog"></i></span> : null}{this.props.title}</button>
                    </span>
                );
                break;

            case 'checkbox':
                input = (
                    <div className={this.props.groupClassName}>
                        {this.props.label ? <label htmlFor={this.props.id} className={this.props.labelClassName}><span>{this.props.label}{this.props.required ? <span className="required-field"> *</span> : null}</span></label> : null}
                        <div className={this.props.wrapperClassName}>
                            <input className={inputClasses} ref="input" type={this.props.type} onChange={this.handleChange.bind(null, this.props.id)} 
                            disabled={this.props.inputDisabled} checked={this.props.checked} style={this.props.fieldStyle} />
                            <div className="form-error">{this.props.error ? <span>{this.props.error}</span> : <span>&nbsp;</span>}</div>
                        </div>
                    </div>
                );
                break;

            case 'submit':
                title = this.props.title ? this.props.title : 'Submit';
                inputClasses = 'btn' + (this.props.inputClassName ? ' ' + this.props.inputClassName : '') + (this.props.submitBusy ? ' submit-busy' : '');
                input = (
                    <span className={this.props.wrapperClassName}>
                        <button className={inputClasses} onClick={this.props.submitHandler} 
                        disabled={this.props.inputDisabled || this.props.submitBusy} style={this.props.fieldStyle}>
                        {this.props.submitBusy ? <span className="submit-spinner"><i className="icon icon-spin icon-cog"></i></span> : null}{title}</button>
                    </span>
                );
                break;

            case 'cancel':
                title = this.props.title ? this.props.title : 'Cancel';
                inputClasses = 'btn' + (this.props.inputClassName ? ' ' + this.props.inputClassName : '');
                input = (
                    <span className={this.props.wrapperClassName}>
                        <button className={inputClasses} onClick={this.props.cancelHandler} disabled={this.props.inputDisabled}
                        style={this.props.fieldStyle} >{title}</button>
                    </span>
                );
                break;

            case 'input-group':
                inputClasses = 'form-control' + (this.props.error ? ' error' : '') + (this.props.inputClassName ? ' ' + this.props.inputClassName : '');
                var innerInput = (
                    <span>
                        <div className="input-group">
                            <input className={inputClasses} type="text" id={this.props.id} name={this.props.id} placeholder={this.props.placeholder}
                                ref="targetInput" value={this.state.value} onChange={this.handleChange.bind(null, this.props.id)} onBlur={this.props.onBlur}
                                maxLength={this.props.maxLength} disabled={this.props.inputDisabled} style={this.props.fieldStyle} />
                            <span className="input-group-btn">
                                {this.props.hasModal ?
                                    this.props.inputGroupBtn
                                    :
                                    <button className="btn btn-default" type="button" id={'input-group-btn-' + this.props.id}>{this.props.inputGroupBtn}</button>
                                }
                            </span>
                        </div>
                        <div className="form-error">{this.props.error ? <span>{this.props.error}</span> : <span>&nbsp;</span>}</div>
                    </span>
                );
                input = (
                    <div className={this.props.groupClassName}>
                        {this.props.label ? <label htmlFor={this.props.id} className={this.props.labelClassName}><span>{this.props.label}{this.props.required ? <span className="required-field"> *</span> : null}</span></label> : null}
                        {this.props.wrapperClassName ? <div className={this.props.wrapperClassName}>{innerInput}</div> : <span>{innerInput}</span>}
                    </div>
                );
                break;

            default:
                break;
        }
        if (this.props.key) {
            return <span key={this.props.key}>{input}</span>;
        } else {
            return <span>{input}</span>;
        }
    }
});
