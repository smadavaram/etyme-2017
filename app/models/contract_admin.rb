class ContractAdmin < ApplicationRecord
  enum role: [:member, :admin]
  belongs_to :contract
  belongs_to :user
  belongs_to :company
end