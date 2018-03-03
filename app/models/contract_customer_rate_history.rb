class ContractCustomerRateHistory < ApplicationRecord
  belongs_to :sell_contract, optional: true
end
