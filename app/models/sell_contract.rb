# frozen_string_literal: true

# == Schema Information
#
# Table name: sell_contracts
#
#  id                          :bigint           not null, primary key
#  number                      :string
#  contract_id                 :bigint
#  company_id                  :integer
#  customer_rate               :decimal(, )      default(0.0)
#  customer_rate_type          :string
#  time_sheet                  :string
#  invoice_terms_period        :string
#  show_accounting_to_employee :boolean
#  created_at                  :datetime         not null
#  updated_at                  :datetime         not null
#  first_date_of_timesheet     :date
#  first_date_of_invoice       :date
#  ts_date_1                   :date
#  ts_date_2                   :date
#  ts_end_of_month             :boolean          default(FALSE)
#  ts_day_of_week              :string
#  max_day_allow_for_timesheet :integer
#  max_day_allow_for_invoice   :integer
#  invoice_date_1              :date
#  invoice_date_2              :date
#  invoice_end_of_month        :boolean          default(FALSE)
#  invoice_day_of_week         :string           default("f")
#  payment_term                :decimal(, )      default(0.0)
#  ts_day_time                 :time
#  invoice_day_time            :time
#  cr_start_date               :date
#  cr_end_date                 :date
#  ts_approve                  :string
#  ta_day_time                 :time
#  ta_date_1                   :date
#  ta_date_2                   :date
#  ta_end_of_month             :boolean          default(FALSE)
#  ta_day_of_week              :string
#  expected_hour               :float            default(0.0)
#  is_performance_review       :boolean          default(FALSE)
#  performance_review          :string
#  pr_day_time                 :time
#  pr_date_1                   :date
#  pr_date_2                   :date
#  pr_day_of_week              :string
#  pr_end_of_month             :boolean          default(FALSE)
#  is_client_expense           :boolean          default(FALSE)
#  client_expense              :string
#  ce_day_time                 :time
#  ce_date_1                   :date
#  ce_date_2                   :date
#  ce_day_of_week              :string
#  ce_end_of_month             :boolean          default(FALSE)
#  ce_approve                  :string
#  ce_ap_day_time              :time
#  ce_ap_date_1                :date
#  ce_ap_date_2                :date
#  ce_ap_day_of_week           :string
#  ce_ap_end_of_month          :boolean          default(FALSE)
#  ce_invoice                  :string
#  ce_in_day_time              :time
#  ce_in_date_1                :date
#  ce_in_date_2                :date
#  ce_in_day_of_week           :string
#  ce_in_end_of_month          :boolean          default(FALSE)
#  ts_2day_of_week             :string
#  ta_2day_of_week             :string
#  invoice_2day_of_week        :string
#  ce_2day_of_week             :string
#  ce_in_2day_of_week          :string
#  pr_2day_of_week             :string
#  ce_ap_2day_of_week          :string
#  integration                 :string
#
class SellContract < ApplicationRecord
  belongs_to :contract, optional: true
  belongs_to :company, optional: true
  has_many :contract_sell_business_details, dependent: :destroy

  has_many :document_signs, as: :initiator
  has_many :document_signs, as: :part_of

  has_many :sell_send_documents, dependent: :destroy
  has_many :sell_request_documents, dependent: :destroy

  has_many :contract_customer_rate_histories, dependent: :destroy

  has_many :approvals, as: :contractable, dependent: :destroy

  has_one :conversation
  has_many :change_rates, as: :rateable, dependent: :destroy
  has_many :contract_cycles, as: :cycle_of
  has_many :contract_admins, as: :admin_able

  # include NumberGenerator.new({prefix: 'SC', length: 7})
  before_create :set_number
  after_create :create_sell_contract_conversation

  accepts_nested_attributes_for :contract_sell_business_details, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :sell_send_documents, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :sell_request_documents, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :approvals, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :change_rates, allow_destroy: true, reject_if: proc { |attributes| attributes['rate'].blank? || attributes['working_hrs'].blank? || attributes['rate_type'].blank? || attributes['from_date'].blank? || attributes['to_date'].blank? }

  after_create :set_contract_customer_rate_history
  after_update :set_contract_customer_rate_history, if: proc { saved_change_to_customer_rate? }

  def set_contract_customer_rate_history
    contract_customer_rate_histories.create(customer_rate: customer_rate, change_date: Time.now)
  end

  def set_number
    # self.number = self.contract.number
    self.number = 'SC_' + contract.number.split('_')[1].to_s
  end

  def create_sell_contract_conversation
    group = nil
    Group.transaction do
      group = contract.company.groups.create(group_name: number, member_type: 'Chat')
      groupies = User.where(id: contract.contract_admins.pluck(:user_id)).to_a + User.where(id: contract_sell_business_details.pluck(:user_id)).to_a
      groupies << contract.created_by
      groupies.uniq.each do |user|
        group.groupables.create(groupable: user)
      end
    end
    build_conversation(chatable: group, topic: :SellContract).save if group
  end

  def get_rate(date)
    rate_on(date)
  end

  def today_rate
    rate_on(Date.today)
  end

  def count_contract_bussiness_details
    contract_sell_business_details.count
  end

  def count_contract_admin
    contract_admins.admin.count
  end

  def team_admin
    contract_admins.admin.first&.user || company.owner
  end

  private

  def rate_on(date)
    rate = change_rates.where('? between from_date and to_date', date).order(:from_date).first
    rate.present? ? rate : change_rates.all.order(:from_date).first
  end
end
