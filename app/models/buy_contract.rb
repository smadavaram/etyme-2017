# frozen_string_literal: true

class BuyContract < ApplicationRecord
  belongs_to :contract, optional: true
  belongs_to :candidate, optional: true
  belongs_to :company, optional: true

  has_many :contract_buy_business_details, dependent: :destroy
  has_many :contract_sale_commisions, dependent: :destroy

  has_many :document_signs, as: :initiator
  has_many :document_signs, as: :part_of

  has_many :buy_send_documents, dependent: :destroy
  has_many :buy_emp_req_docs, dependent: :destroy
  has_many :buy_ven_req_docs, dependent: :destroy

  has_many :approvals, as: :contractable, dependent: :destroy
  # include DateCalculation.new({prefix: 'BC', length: 7})
  has_one :conversation
  has_many :change_rates, as: :rateable, dependent: :destroy
  has_many :contract_cycles, as: :cycle_of
  has_many :commission_queues
  belongs_to :payroll_info, optional: true
  include DateCalculation

  before_create :set_number
  after_create :create_buy_contract_conversation

  # before_create :set_first_timesheet_date
  # after_create  :set_salary_frequency
  # after_create  :set_candidate

  accepts_nested_attributes_for :contract_buy_business_details, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :contract_sale_commisions, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :buy_send_documents, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :buy_emp_req_docs, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :buy_ven_req_docs, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :change_rates, allow_destroy: true, reject_if: proc { |attributes| attributes['rate'].blank? || attributes['working_hrs'].blank? || attributes['working_hrs'].blank? || attributes['rate_type'].blank? || attributes['from_date'].blank? || attributes['to_date'].blank? || attributes['uscis'].blank? }

  validates_presence_of :ts_date_1, if: proc { |b_con| b_con.time_sheet == 'twice a month' }, message: 'Please select first date for timesheet'
  validates_presence_of :ts_date_1, if: proc { |b_con| b_con.time_sheet == 'month' && !b_con.ts_end_of_month }, message: 'Please select first date for timesheet'
  validates_presence_of :ts_date_2, if: proc { |b_con| b_con.time_sheet == 'twice a month' && !b_con.ts_end_of_month }, message: 'Please select second date or end of month'
  validates_presence_of :ts_day_of_week, if: proc { |b_con| b_con.time_sheet == 'weekly' || b_con.time_sheet == 'biweekly' }, message: 'Please select day of week'

  attr_accessor :ssn

  def set_number
    self.number = 'BC_' + contract.number.split('_')[1].to_s
  end

  def set_first_timesheet_date
    if time_sheet == 'daily'
      time_sheet_date = contract.start_date
    elsif time_sheet == 'weekly' || time_sheet == 'biweekly'
      time_sheet_date = date_of_next(ts_day_of_week, contract.start_date)
    elsif time_sheet == 'twice a month'
      time_sheet_date = ts_date_1
    elsif time_sheet == 'monthly'
      time_sheet_date = if ts_end_of_month
                          contract.start_date.end_of_month
                        else
                          ts_date_1
                        end
    end
    self.first_date_of_timesheet = time_sheet_date
  end

  def set_salary_frequency
    self.salary_process = salary_calculation
    self.salary_clear = salary_calculation
    save
  end

  def set_candidate
    self.candidate = contract.candidate
    save
  end

  # def display_number
  #   "BC"+self.number
  # end

  def ssn
    legacy_ssn
  end

  def ssn=(number)
    self.legacy_ssn = number
  end

  def fetch_contract_type_label
    { "W2": 'W2 (Fulltime)', "1099": '1099 (Freelancers)', "C2C": 'Corp-Corp (Third Party)' }[contract_type.to_sym]
  end

  def get_rate(date)
    rate_on(date)
  end

  def today_rate
    rate_on(Date.today)
  end

  private

  def rate_on(date)
    rate = change_rates.where('? between from_date and to_date', date).order(:from_date).first
    rate.present? ? rate : change_rates.all.order(:from_date).first
  end

  def create_buy_contract_conversation
    group = nil
    Group.transaction do
      group = contract.company.groups.create(group_name: number, member_type: 'Chat')
      groupies = User.where(id: contract.contract_admins.pluck(:user_id)).to_a << contract.candidate
      groupies << contract.created_by
      groupies.uniq.each do |user|
        group.groupables.create(groupable: user)
      end
    end
    build_conversation(chatable: group, topic: :BuyContract).save if group
  end

  def legacy_ssn
    return unless encrypted_ssn.present?

    SsnEncryption.decrypt(encrypted_ssn)
  end

  def legacy_ssn=(origin_ssn)
    return unless origin_ssn.present?

    self.encrypted_ssn = SsnEncryption.encrypt(origin_ssn)
  end

  module SsnEncryption
    module_function

    def salt
      "*I\xC6\xEF\xD3/\xF5\xC6&\xD8+\xB6\x98G\xEE\xFD\xE6&kK\xFC\xB3\xEE\x04^\xD1\xCC\v\xCC\x16h:Q\x84\xB2 \xEA\xD7i \x1E3\xEF\xDFG6@\x03\xC4\xD4\x8C\xA7\x90\x95\xF6\rB\xA4\xCF\xE8y\xD2\xC9\x89"
    end

    def key
      ActiveSupport::KeyGenerator.new('dsfdsguisd').generate_key(salt)
    end

    def encrypt(value)
      crypt = ActiveSupport::MessageEncryptor.new(key)
      crypt.encrypt_and_sign(value)
    end

    def decrypt(value)
      crypt = ActiveSupport::MessageEncryptor.new(key)
      crypt.decrypt_and_verify(value)
    end
  end
end
