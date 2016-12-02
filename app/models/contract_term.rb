class ContractTerm < ActiveRecord::Base

  #Enum
  enum status:                { active: 0, archived: 1}

  #Association
  belongs_to :contract
  belongs_to :created_by , class_name: 'User' , foreign_key: :created_by

end
