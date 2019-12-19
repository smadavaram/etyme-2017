class ContractAdmin < ApplicationRecord
  enum role: [:member, :admin]
  belongs_to :contract
  belongs_to :user
  belongs_to :company
  belongs_to :hradminable, polymorphic: true

  before_save :enforce_admin
  def enforce_admin
    self.role = :admin  if self.hradminable.count_contract_admin == 0
  end

end