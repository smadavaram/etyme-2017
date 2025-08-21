# frozen_string_literal: true

# == Schema Information
#
# Table name: contract_admins
#
#  id              :bigint           not null, primary key
#  user_id         :bigint
#  company_id      :bigint
#  contract_id     :bigint
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  contract_admin  :string
#  admin_able_type :string
#  admin_able_id   :bigint
#  role            :integer
#
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
