class ContractSaleCommision < ApplicationRecord
  belongs_to :contract, optional: true
  has_many :csc_accounts

  accepts_nested_attributes_for :csc_accounts, allow_destroy: true,reject_if: :all_blank
end
