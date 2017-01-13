class TimesheetApprover < ActiveRecord::Base
  enum status: [:open,:pending_review, :approved , :partially_approved , :rejected , :submitted]

  belongs_to :user
  belongs_to :timesheet
  has_one    :job , through: :timesheet
  has_one    :contract , through: :timesheet
  after_create :approve_timesheet , if: Proc.new{|t| t.is_master_user? && t.approved?}
  after_create :submit_timesheet , if: Proc.new{|t| t.is_assign_user? && t.submitted? }

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

  private

  def approve_timesheet
    self.timesheet.approved!
  end

  def submit_timesheet
    self.timesheet.submitted!
  end

end
