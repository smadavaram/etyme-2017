class ContractSaleCommision < ApplicationRecord
  belongs_to :contract, optional: true
end
