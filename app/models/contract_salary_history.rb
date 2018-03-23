class ContractSalaryHistory < ApplicationRecord

  belongs_to :contract
  belongs_to :company, optional: true
  belongs_to :candidate, optional: true

  belongs_to :salable, polymorphic: :true

end
