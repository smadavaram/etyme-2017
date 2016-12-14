class Transaction < ActiveRecord::Base

  #Enum
  enum status: [:pending , :accepted , :rejected]

  #Association
  belongs_to :timesheet_log
end
