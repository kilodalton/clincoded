'use strict';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import createReactClass from 'create-react-class';
import moment from 'moment';
import { RestMixin } from '../rest';
import { PanelGroup, Panel } from '../../libs/bootstrap/panel';
import { Form, FormMixin, Input } from '../../libs/bootstrap/form';
import { getAffiliationName } from '../../libs/get_affiliation_name';
import DayPickerInput from 'react-day-picker/DayPickerInput';
import MomentLocaleUtils, { formatDate, parseDate } from 'react-day-picker/moment';
import * as CuratorHistory from '../curator_history';
import * as curator from '../curator';
const CurationMixin = curator.CurationMixin;

const ProvisionalApproval = module.exports.ProvisionalApproval = createReactClass({
    mixins: [RestMixin, FormMixin, CurationMixin, CuratorHistory],

    propTypes: {
        gdm: PropTypes.object,
        session: PropTypes.object,
        provisional: PropTypes.object,
        classification: PropTypes.string,
        classificationStatus: PropTypes.string,
        affiliation: PropTypes.object, // User's affiliation
        classificationSnapshots: PropTypes.array,
        updateSnapshotList: PropTypes.func,
        updateProvisionalObj: PropTypes.func
    },

    getInitialState() {
        return {
            provisionalDate: this.props.provisional && this.props.provisional.provisionalDate ? this.props.provisional.provisionalDate : undefined,
            provisionalReviewDate: this.props.provisional && this.props.provisional.provisionalReviewDate ? this.props.provisional.provisionalReviewDate : undefined,
            provisionalComment: this.props.provisional && this.props.provisional.provisionalComment ? this.props.provisional.provisionalComment : undefined,
            provisionalSubmitter: this.props.provisional && this.props.provisional.provisionalSubmitter ? this.props.provisional.provisionalSubmitter : undefined,
            isProvisionalPreview: this.props.provisional && this.props.provisional.classificationStatus === 'Provisional' ? true : false,
            isProvisionalEdit: false,
            classificationSnapshots: this.props.classificationSnapshots ? this.props.classificationSnapshots : undefined,
            currProvisionalSnapshot: null
        };
    },

    componentWillReceiveProps(nextProps) {
        if (nextProps.classificationSnapshots) {
            this.setState({classificationSnapshots: nextProps.classificationSnapshots});
        }
    },

    handleProvisionalReviewDateChange(provisionalReviewDate) {
        this.setState({provisionalReviewDate});
    },

    /**
     * Method to handle previewing provisional form data
     */
    handlePreviewProvisional() {
        const provisionalComment = this.provisionalCommentInput.getValue();
        this.setState({
            provisionalSubmitter: this.props.session.user_properties.title,
            provisionalComment: provisionalComment.length ? provisionalComment : undefined
        }, () => {
            this.setState({isProvisionalPreview: true});
        });
    },

    /**
     * Method to handle resetting the provisional form data
     */
    handleCancelProvisional() {
        this.setState({
            provisionalReviewDate: this.props.provisional && this.props.provisional.provisionalDate ? this.props.provisional.provisionalDate : undefined,
            provisionalComment: this.props.provisional && this.props.provisional.provisionalComment ? this.props.provisional.provisionalComment : undefined,
            isProvisionalPreview: false
        });
    },

    /**
     * Method to handle editing provisional form
     */
    handleEditProvisional() {
        this.setState({isProvisionalPreview: false});
    },

    /**
     * Method to handle submitting provisional form
     */
    submitForm(e) {
        e.preventDefault();
        e.stopPropagation();
        let newProvisional = this.props.provisional.uuid ? curator.flatten(this.props.provisional) : {};
        newProvisional.classificationStatus = 'Provisional';
        newProvisional.provisionedClassification = true;
        newProvisional.provisionalSubmitter = this.state.provisionalSubmitter;
        newProvisional.provisionalDate = moment().toISOString();
        newProvisional.provisionalReviewDate = this.state.provisionalReviewDate;
        if (this.state.provisionalComment && this.state.provisionalComment.length) {
            newProvisional.provisionalComment = this.state.provisionalComment;
        } else {
            if (newProvisional.provisionalComment) {
                delete newProvisional['provisionalComment'];
            }
        }
        // Update existing provisional data object
        return this.putRestData('/provisional/' + this.props.provisional.uuid, newProvisional).then(data => {
            let provisionalClassification = data['@graph'][0];
            this.props.updateProvisionalObj(provisionalClassification['@id']);
            // Record classification approval history
            let meta = {
                provisionalClassification: {
                    gdm: this.props.gdm['@id'],
                    alteredClassification: provisionalClassification.alteredClassification,
                    classificationStatus: provisionalClassification.classificationStatus
                }
            };
            this.recordHistory('modify', provisionalClassification, meta);
            // Redirect user to the record page
            // window.location.href = '/curation-central/?gdm=' + this.props.gdm.uuid;
            return Promise.resolve(provisionalClassification);
        }).then(result => {
            let newSnapshot = {
                resourceId: result.uuid,
                resourceType: 'classification',
                approvalStatus: 'Provisioned',
                resource: result,
                resourceParent: this.props.gdm
            };
            this.postRestData('/snapshot/', newSnapshot).then(response => {
                let provisionalSnapshot = response['@graph'][0];
                this.setState({currProvisionalSnapshot: provisionalSnapshot});
                this.props.updateSnapshotList(provisionalSnapshot['@id']);
            }).catch(err => {
                console.log('Saving provisional snashot error = : %o', err);
            });
        }).catch(err => {
            console.log('Classification provisional submission error = : %o', err);
        });
    },

    viewSnapshotClassificationMatrix(snapshotUuid, e) {
        e.preventDefault(); e.stopPropagation();
        window.open('/provisional-classification/?snapshot=' + snapshotUuid, '_blank');
    },

    viewSnapshotEvidenceSummary(snapshotUuid, e) {
        e.preventDefault(); e.stopPropagation();
        window.open('/gene-disease-evidence-summary/?snapshot=' + snapshotUuid, '_blank');
    },

    renderProvisionalSnapshot(snapshot) {
        if (snapshot.approvalStatus === 'Provisioned' && snapshot.resourceType === 'classification') {
            return (
                <tr className="provisional-approval-snapshot-item" key={snapshot['@id']}>
                    <td className="provisional-approval-snapshot-content">
                        {snapshot.resource && snapshot.resource.affiliation ?
                            <dl className="inline-dl clearfix">
                                <dt><span>ClinGen Affiliation:</span></dt>
                                <dd>{getAffiliationName(snapshot.resource.affiliation)}</dd>
                            </dl>
                            : null}
                        <dl className="inline-dl clearfix snapshot-provisional-approval-submitter">
                            <dt><span>Provisional Classification entered by:</span></dt>
                            <dd>{snapshot.resource.provisionalSubmitter}</dd>
                        </dl>
                        <dl className="inline-dl clearfix snapshot-provisional-approval-date">
                            <dt><span>Date saved as Provisional:</span></dt>
                            <dd><span>{snapshot.resource.provisionalDate ? formatDate(snapshot.resource.provisionalDate, "YYYY MMM DD") : null}</span></dd>
                        </dl>
                        <dl className="inline-dl clearfix snapshot-provisional-review-date">
                            <dt><span>Date reviewed:</span></dt>
                            <dd><span>{snapshot.resource.provisionalReviewDate ? formatDate(snapshot.resource.provisionalReviewDate, "YYYY MMM DD") : null}</span></dd>
                        </dl>
                        <dl className="inline-dl clearfix snapshot-provisional-approval-classification">
                            <dt><span>Saved classification:</span></dt>
                            <dd><span>{snapshot.resource.alteredClassification ? <span>{snapshot.resource.alteredClassification} (modified)</span> : snapshot.resource.autoClassification}</span></dd>
                        </dl>
                        <dl className="inline-dl clearfix snapshot-provisional-approval-comment">
                            <dt><span>Additional comments:</span></dt>
                            <dd><span>{snapshot.resource.provisionalComment ? snapshot.resource.provisionalComment : null}</span></dd>
                        </dl>
                    </td>
                    <td className="provisional-approval-snapshot-buttons">
                        <Input type="button" inputClassName="btn-primary" title="Classification Matrix" clickHandler={this.viewSnapshotClassificationMatrix.bind(this, snapshot.uuid)} />
                        <Input type="button" inputClassName="btn-primary" title="Evidence Summary" clickHandler={this.viewSnapshotEvidenceSummary.bind(this, snapshot.uuid)} />
                    </td>
                </tr>
            );
        }
    },

    render() {
        const provisionalSubmitter = this.state.provisionalSubmitter;
        const provisionalDate = this.state.provisionalDate ? moment(this.state.provisionalDate).format('YYYY MM DD') : moment().format('YYYY MM DD');
        const provisionalReviewDate = this.state.provisionalReviewDate ? moment(this.state.provisionalReviewDate).format('MM/DD/YYYY') : '';
        const provisionalComment = this.state.provisionalComment;
        const session = this.props.session;
        const provisional = this.props.provisional;
        const classification = this.props.classification;
        const affiliation = provisional.affiliation ? provisional.affiliation : (this.props.affiliation ? this.props.affiliation : null);
        const panelTitle = provisional && provisional.classificationStatus !== 'In progress' ? "Saved Provisional Classification(s)" : "Save Classification as Provisional";
        const snapshots = this.state.classificationSnapshots;

        return (
            <div className={this.props.classificationStatus === 'In progress' ? "container approval-process provisional-approval in-progress" : "container approval-process provisional-approval"}>
                <PanelGroup>
                    <Panel title={panelTitle} panelClassName="panel-data" open>
                        {provisional && this.props.classificationStatus === 'In progress' ?
                            <Form submitHandler={this.submitForm} formClassName="form-horizontal form-std">
                                {this.state.isProvisionalPreview ?
                                    <div className="provisional-preview">
                                        <div className="col-md-12 provisional-form-content-wrapper">
                                            <div className="col-xs-12 col-sm-4">
                                                <div className="provisional-affiliation">
                                                    <dl className="inline-dl clearfix">
                                                        <dt><span>ClinGen Affiliation:</span></dt>
                                                        <dd>{affiliation ? getAffiliationName(affiliation) : null}</dd>
                                                    </dl>
                                                </div>
                                                <div className="provisional-submitter">
                                                    <dl className="inline-dl clearfix">
                                                        <dt><span>Provisional Classification entered by:</span></dt>
                                                        <dd>{provisionalSubmitter ? provisionalSubmitter : null}</dd>
                                                    </dl>
                                                </div>
                                            </div>
                                            <div className="col-xs-12 col-sm-3">
                                                <div className="provisional-date">
                                                    <dl className="inline-dl clearfix preview-provisional-date">
                                                        <dt><span>Date saved as Provisional:</span></dt>
                                                        <dd><span>{provisionalDate ? formatDate(parseDate(provisionalDate), "YYYY MMM DD") : null}</span></dd>
                                                    </dl>
                                                </div>
                                                <div className="approval-review-date">
                                                    <dl className="inline-dl clearfix preview-provisional-review-date">
                                                        <dt><span>Date reviewed:</span></dt>
                                                        <dd><span>{provisionalReviewDate ? formatDate(parseDate(provisionalReviewDate), "YYYY MMM DD") : null}</span></dd>
                                                    </dl>
                                                </div>
                                            </div>
                                            <div className="col-xs-12 col-sm-5">
                                                <div className="provisional-comments">
                                                    <dl className="inline-dl clearfix preview-provisional-comment">
                                                        <dt><span>Additional comments:</span></dt>
                                                        <dd><span>{provisionalComment ? provisionalComment : null}</span></dd>
                                                    </dl>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="col-md-12 alert alert-warning provisional-preview-note"><i className="icon icon-exclamation-circle"></i> This is a Preview; you must Submit.</div>
                                    </div>
                                    :
                                    <div className="provisional-edit">
                                        <div className="col-md-12 provisional-form-content-wrapper">
                                            <div className="col-xs-12 col-sm-4">
                                                <div className="provisional-affiliation">
                                                    <dl className="inline-dl clearfix">
                                                        <dt><span>ClinGen Affiliation:</span></dt>
                                                        <dd>{affiliation ? getAffiliationName(affiliation) : null}</dd>
                                                    </dl>
                                                </div>
                                                <div className="provisional-submitter">
                                                    <dl className="inline-dl clearfix">
                                                        <dt><span>Provisional Classification entered by:</span></dt>
                                                        <dd>{provisionalSubmitter ? provisionalSubmitter : null}</dd>
                                                    </dl>
                                                </div>
                                            </div>
                                            <div className="col-xs-12 col-sm-3">
                                                <div className="provisional-review-date">
                                                    <div className="form-group">
                                                        <label className="col-sm-5 control-label">Date reviewed:</label>
                                                        <div className="col-sm-7">
                                                            <DayPickerInput
                                                                value={provisionalReviewDate}
                                                                onDayChange={this.handleProvisionalReviewDateChange}
                                                                formatDate={formatDate}
                                                                parseDate={parseDate}
                                                                placeholder={`${formatDate(new Date())}`}
                                                                dayPickerProps={{
                                                                    selectedDays: provisionalReviewDate ? parseDate(provisionalReviewDate) : undefined,
                                                                    disabledDays: {
                                                                        daysOfWeek: [0, 6]
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="col-xs-12 col-sm-5">
                                                <div className="provisional-comments">
                                                    <Input type="textarea" ref={(input) => { this.provisionalCommentInput = input; }}
                                                        label="Additional comments:" value={provisionalComment} rows="5"
                                                        labelClassName="col-sm-5 control-label" wrapperClassName="col-sm-7" groupClassName="form-group" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                }
                                <div className="col-md-12 provisional-form-buttons-wrapper">
                                    {this.state.isProvisionalPreview ?
                                        <div className="button-group">
                                            <button type="button" className="btn btn-default btn-inline-spacer"
                                                onClick={this.handleCancelProvisional}>
                                                Cancel Provisional
                                            </button>
                                            <button type="button" className="btn btn-info btn-inline-spacer"
                                                onClick={this.handleEditProvisional}>
                                                Edit <i className="icon icon-pencil"></i>
                                            </button>
                                            <button type="submit" className="btn btn-primary btn-inline-spacer pull-right">
                                                Submit Provisional <i className="icon icon-check-square-o"></i>
                                            </button>
                                        </div>
                                        :
                                        <div className="button-group">
                                            <button type="button" className="btn btn-default btn-inline-spacer pull-right"
                                                onClick={this.handlePreviewProvisional}>
                                                Preview Provisional
                                            </button>
                                        </div>
                                    }
                                </div>
                            </Form>
                            : null}
                        {/* Render snapshots of all saved provisioned classifications */}
                        {snapshots && snapshots.length ?
                            <table className="table provisional-approval-snapshot-list">
                                <tbody>
                                    {snapshots.map(snapshot => this.renderProvisionalSnapshot(snapshot))}
                                </tbody>
                            </table>
                            : null}
                    </Panel>
                </PanelGroup>
            </div>
        );
    }
});