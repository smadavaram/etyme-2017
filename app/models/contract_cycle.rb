class ContractCycle < ApplicationRecord
  belongs_to :contract, optional: true
  belongs_to :company, optional: true
  belongs_to :candidate, optional: true
  belongs_to :cyclable, polymorphic: true

end
