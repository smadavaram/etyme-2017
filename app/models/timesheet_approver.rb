class TimesheetApprover < ActiveRecord::Base

  #Associations
  belongs_to :user
  belongs_to :timesheet
end
