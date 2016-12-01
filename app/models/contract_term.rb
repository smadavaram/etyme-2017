class ContractTerm < ActiveRecord::Base

  #Enum
  enum status:                { active: 0, archived: 1}

  #Association
  belongs_to :contract
end
