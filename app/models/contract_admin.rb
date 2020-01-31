# frozen_string_literal: true

class ContractAdmin < ApplicationRecord
  enum role: %i[member admin]
  belongs_to :contract
  belongs_to :user
  belongs_to :company
  belongs_to :admin_able, polymorphic: true

  before_save :enforce_admin
  def enforce_admin
    self.role = :admin if admin_able.count_contract_admin == 0
  end
end
