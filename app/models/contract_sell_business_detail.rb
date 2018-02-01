class ContractSellBusinessDetail < ApplicationRecord
  belongs_to :contract, optional: true
end
