# == Schema Information
#
# Table name: etyme_transactions
#
#  id                    :bigint           not null, primary key
#  amount                :integer
#  transaction_type      :string
#  salary_id             :string
#  contract_id           :string
#  contract_cycle_id     :string
#  description           :string
#  company_id            :bigint
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  is_processed          :boolean
#  transaction_user_type :string
#  transaction_user_id   :string
#
class EtymeTransaction < ActiveRecord::Base
  belongs_to :company
end
