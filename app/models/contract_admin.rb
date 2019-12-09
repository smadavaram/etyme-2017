class ContractAdmin < ApplicationRecord
  belongs_to :contract
  belongs_to :user
  belongs_to :company

end