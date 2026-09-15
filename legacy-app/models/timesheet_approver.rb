# frozen_string_literal: true

# == Schema Information
#
# Table name: timesheet_approvers
#
#  id           :integer          not null, primary key
#  user_id      :integer
#  timesheet_id :integer
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  status       :integer
#
class TimesheetApprover < ApplicationRecord
  include Rails.application.routes.url_helpers

  enum status: %i[open pending_review approved partially_approved rejected submitted]

  belongs_to :user, optional: true
  belongs_to :timesheet, optional: true
  has_one    :job, through: :timesheet
  has_one    :contract, through: :timesheet
  # after_create :approve_timesheet , if: Proc.new{|t| t.is_master_user? && t.approved?}
  # after_create :submit_timesheet , if: Proc.new{|t| t.is_assign_user? && t.submitted? }
  # after_create :notify_user_on_change_timesheet_status

  validates :status,             inclusion: { in: statuses.keys }

  default_scope -> { where.not(status: nil) }
  scope :accepted_or_rejected, ->(user) { where('timesheet_approvers.user_id = ? AND (timesheet_approvers.status = ? OR timesheet_approvers.status = ?)', user.id, Timesheet.statuses[:approved], Timesheet.statuses[:rejected]) }
  scope :is_already_submitted?, ->(user) { where('timesheet_approvers.user_id = ? AND (timesheet_approvers.status = ?)', user.id, Timesheet.statuses[:submitted]).present? }

  def is_master_user?
    user == job.created_by
  end

  def is_assign_user?
    user.has_submission_permission?(contract.assignee)
  end

  def status_by
    (status.humanize + ' by ' + user.full_name).to_s
  end

  def notify_user_on_change_timesheet_status
    if user == contract.assignee
      contract.respond_by.notifications.create(message: contract.assignee.full_name + " has submitted the timesheet <br> <p> <a href='http://#{contract.respond_by.etyme_url + timesheet_timesheet_log_path(timesheet, timesheet.timesheet_logs.last)}'>  Click here to review </a> </p>", title: 'Timesheet')
    elsif user == contract.respond_by
      contract.assignee.notifications.create(message: contract.respond_by.full_name + " has #{status.titleize} your timesheet <br> <p> <a href='http://#{contract.assignee.etyme_url + timesheet_timesheet_log_path(timesheet, timesheet.timesheet_logs.last)}'>  Click here to view the timesheet </a> </p>", title: 'Timesheet')
      contract.created_by.notifications.create(message: contract.respond_by.full_name + " has submitted the timesheet <br> <p> <a href='http://#{contract.created_by.etyme_url + timesheet_timesheet_log_path(timesheet, timesheet.timesheet_logs.last)}'>  Click here to review </a> </p>", title: 'Timesheet') if submitted?
    elsif user == contract.created_by
      contract.respond_by.notifications.create(message: contract.created_by.full_name + " has #{status.titleize} your timesheet <br> <p> <a href='http://#{contract.respond_by.etyme_url + timesheet_timesheet_log_path(timesheet, timesheet.timesheet_logs.last)}'>  Click here to view the timesheet </a> </p>", title: 'Timesheet')
    end
  end

  private

  def approve_timesheet
    timesheet.approved!
  end

  def submit_timesheet
    timesheet.submitted!
  end
end
