class TimesheetLog < ActiveRecord::Base
  #Enum
  enum status: [:pending , :approved , :partially_approved , :rejected]

  #Associations
  belongs_to :timesheet
  has_many   :transactions

end
