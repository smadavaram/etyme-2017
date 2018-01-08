class ContractTerm < ApplicationRecord

  enum status:                { active: 0, archived: 1}

  belongs_to :contract, optional: true
  has_many   :timesheet_logs
  belongs_to :user , class_name: 'User' , foreign_key: 'created_by', optional: true

  validates :status ,             inclusion: {in: statuses.keys}
  validates_numericality_of :rate, presence: true, greater_than_or_equal_to: 1


end
