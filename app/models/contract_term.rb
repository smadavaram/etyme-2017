class ContractTerm < ActiveRecord::Base

  enum status:                { active: 0, archived: 1}

  belongs_to :contract
  has_many   :timesheet_logs
  belongs_to :user , class_name: 'User' , foreign_key: 'created_by'

  validates :status ,             inclusion: {in: statuses.keys}

end
