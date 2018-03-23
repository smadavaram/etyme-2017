class TimesheetApprover < ApplicationRecord

  include Rails.application.routes.url_helpers


  enum status: [:open,:pending_review, :approved , :partially_approved , :rejected , :submitted]

  belongs_to :user, optional: true
  belongs_to :timesheet, optional: true
  has_one    :job , through: :timesheet
  has_one    :contract , through: :timesheet
  after_create :approve_timesheet , if: Proc.new{|t| t.is_master_user? && t.approved?}
  after_create :submit_timesheet , if: Proc.new{|t| t.is_assign_user? && t.submitted? }
  # after_create :notify_user_on_change_timesheet_status

  validates :status ,             inclusion: {in: statuses.keys}

  default_scope -> {where.not(status: nil)}
  scope :accepted_or_rejected, ->(user) {where('timesheet_approvers.user_id = ? AND (timesheet_approvers.status = ? OR timesheet_approvers.status = ?)' , user.id , Timesheet.statuses[:approved] , Timesheet.statuses[:rejected])}
  scope :is_already_submitted?, ->(user) {where('timesheet_approvers.user_id = ? AND (timesheet_approvers.status = ?)' , user.id , Timesheet.statuses[:submitted]).present?}


  def is_master_user?
    self.user == self.job.created_by
  end

  def is_assign_user?
    self.user.has_submission_permission?(self.contract.assignee)
  end

  def status_by
    "#{self.status.humanize+' by '+ self.user.full_name}"
  end

  def notify_user_on_change_timesheet_status
    if self.user == self.contract.assignee
        self.contract.respond_by.notifications.create(message: self.contract.assignee.full_name+" has submitted the timesheet <br> <p> <a href='http://#{self.contract.respond_by.etyme_url + timesheet_timesheet_log_path(self.timesheet , self.timesheet.timesheet_logs.last)}'>  Click here to review </a> </p>" ,title: "Timesheet")
    elsif self.user == self.contract.respond_by
       self.contract.assignee.notifications.create(message: self.contract.respond_by.full_name+" has #{self.status.titleize} your timesheet <br> <p> <a href='http://#{self.contract.assignee.etyme_url + timesheet_timesheet_log_path(self.timesheet , self.timesheet.timesheet_logs.last)}'>  Click here to view the timesheet </a> </p>" ,title: "Timesheet")
       self.contract.created_by.notifications.create(message: self.contract.respond_by.full_name+" has submitted the timesheet <br> <p> <a href='http://#{self.contract.created_by.etyme_url + timesheet_timesheet_log_path(self.timesheet , self.timesheet.timesheet_logs.last)}'>  Click here to review </a> </p>" ,title: "Timesheet") if self.submitted?
      elsif self.user == self.contract.created_by
        self.contract.respond_by.notifications.create(message: self.contract.created_by.full_name+" has #{self.status.titleize} your timesheet <br> <p> <a href='http://#{self.contract.respond_by.etyme_url + timesheet_timesheet_log_path(self.timesheet , self.timesheet.timesheet_logs.last)}'>  Click here to view the timesheet </a> </p>" ,title: "Timesheet")
    end
  end

  private

  def approve_timesheet
    self.timesheet.approved!
  end

  def submit_timesheet
    self.timesheet.submitted!
  end

end
