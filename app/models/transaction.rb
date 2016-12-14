class Transaction < ActiveRecord::Base

  #Enum
  enum status: [:pending , :accepted , :rejected]

  #Association
  belongs_to :timesheet_log
  has_one :timesheet, through: :timesheet_log
end
