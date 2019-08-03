class BuyContract < ApplicationRecord

  belongs_to :contract, optional: true
  belongs_to :candidate, optional: true
  belongs_to :company, optional: true

  has_many :contract_buy_business_details, dependent: :destroy
  has_many :contract_sale_commisions, dependent: :destroy

  has_many :document_signs, as: :initiator

  has_many :buy_send_documents, dependent: :destroy
  has_many :buy_emp_req_docs, dependent: :destroy
  has_many :buy_ven_req_docs, dependent: :destroy

  has_many :approvals, as: :contractable, dependent: :destroy
  # include DateCalculation.new({prefix: 'BC', length: 7})

  include DateCalculation

  before_create :set_number
  # before_create :set_first_timesheet_date
  # after_create  :set_salary_frequency
  # after_create  :set_candidate

  accepts_nested_attributes_for :contract_buy_business_details, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :contract_sale_commisions, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :buy_send_documents, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :buy_emp_req_docs, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :buy_ven_req_docs, allow_destroy: true, reject_if: :all_blank

  validates_presence_of :ts_date_1, if: Proc.new { |b_con| b_con.time_sheet == "twice a month" }, :message => "Please select first date for timesheet"
  validates_presence_of :ts_date_1, if: Proc.new { |b_con| b_con.time_sheet == "month" && !b_con.ts_end_of_month }, :message => "Please select first date for timesheet"
  validates_presence_of :ts_date_2, if: Proc.new { |b_con| b_con.time_sheet == "twice a month" && !b_con.ts_end_of_month }, :message => "Please select second date or end of month"
  validates_presence_of :ts_day_of_week, if: Proc.new { |b_con| b_con.time_sheet == "weekly" || b_con.time_sheet == "biweekly" }, :message => "Please select day of week"

  attr_accessor :ssn

  def set_number
    self.number = "BC_" + self.contract.number.split("_")[1].to_s
  end

  def set_first_timesheet_date
    if self.time_sheet == "daily"
      time_sheet_date = self.contract.start_date
    elsif self.time_sheet == "weekly" || self.time_sheet == "biweekly"
      time_sheet_date = date_of_next(self.ts_day_of_week, self.contract.start_date)
    elsif self.time_sheet == "twice a month"
      time_sheet_date = self.ts_date_1
    elsif self.time_sheet == "monthly"
      if self.ts_end_of_month
        time_sheet_date = self.contract.start_date.end_of_month
      else
        time_sheet_date = self.ts_date_1
      end
    end
    self.first_date_of_timesheet = time_sheet_date
  end

  def set_salary_frequency
    self.salary_process = self.salary_calculation
    self.salary_clear = self.salary_calculation
    self.save
  end

  def set_candidate
    self.candidate = self.contract.candidate
    self.save
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

  private

  def legacy_ssn
    return unless encrypted_ssn.present?
    SsnEncryption.decrypt(encrypted_ssn)
  end

  def legacy_ssn=(origin_ssn)
    return unless origin_ssn.present?
    self.encrypted_ssn = SsnEncryption.encrypt(origin_ssn)
  end

  module SsnEncryption
    extend self

    def salt
      "*I\xC6\xEF\xD3/\xF5\xC6&\xD8+\xB6\x98G\xEE\xFD\xE6&kK\xFC\xB3\xEE\x04^\xD1\xCC\v\xCC\x16h:Q\x84\xB2 \xEA\xD7i \x1E3\xEF\xDFG6@\x03\xC4\xD4\x8C\xA7\x90\x95\xF6\rB\xA4\xCF\xE8y\xD2\xC9\x89"
    end

    def key
      ActiveSupport::KeyGenerator.new("dsfdsguisd").generate_key(salt)
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
