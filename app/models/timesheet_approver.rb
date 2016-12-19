class TimesheetApprover < ActiveRecord::Base
  enum status: [:open,:pending_review, :approved , :partially_approved , :rejected , :submitted]

  belongs_to :user
  belongs_to :timesheet
  has_one    :job , through: :timesheet
  after_create :approve_timesheet , if: Proc.new{|t| t.is_master_user? }

  validates :status ,             inclusion: {in: statuses.keys}

  def is_master_user?
    self.user == self.job.created_by
  end

  default_scope -> {where.not(status: nil)}
  scope :accepted_or_rejected, ->(user) {where('timesheet_approvers.user_id = ? AND (timesheet_approvers.status = ? OR timesheet_approvers.status = ?)' , user.id , 2 , 4)}
  def status_by
    "#{self.status.humanize+' by '+ self.user.full_name}"
  end

  private

  def approve_timesheet
    self.timesheet.approved!
  end
end
