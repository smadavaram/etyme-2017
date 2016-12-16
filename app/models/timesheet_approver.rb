class TimesheetApprover < ActiveRecord::Base

  #Associations
  belongs_to :user
  belongs_to :timesheet
  has_one    :job , through: :timesheet
  after_create :approve_timesheet , if: Proc.new{|t| t.is_master_user? }

  def is_master_user?
    self.user == self.job.created_by
  end

  private

  def approve_timesheet
    self.timesheet.approved!
  end
end
