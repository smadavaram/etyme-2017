# frozen_string_literal: true

class Contract < ApplicationRecord
  require 'sequence'
  include PublicActivity::Model
  include Cycle::CycleMaker
  include Rails.application.routes.url_helpers

  include CandidateHelper

  enum status: %i[pending accepted rejected is_ended cancelled paused in_progress draft]
  enum billing_frequency: %i[weekly_invoice monthly_invoice]
  enum time_sheet_frequency: [:daily, :weekly, :biweekly, 'twice a month', :monthly]
  enum commission_type: %i[perhour fixed]
  enum contract_type: [:W2, '1099', :C2C, :contract_independent, :contract_w2, :contract_C2H_independent, :contract_C2H_w2, :third_party_crop_to_crop, :third_party_C2H_crop_to_crop]
  enum cc_job: %i[remaining started finished errored]
  CONTRACTABLE = %i[company candidate].freeze

  attr_accessor :company_doc_ids

  belongs_to :created_by, class_name: 'User', foreign_key: :created_by_id, optional: true
  belongs_to :respond_by, class_name: 'User', foreign_key: :respond_by_id, optional: true
  belongs_to :assignee, class_name: 'User', foreign_key: :assignee_id, optional: true
  belongs_to :job_application, optional: true
  belongs_to :job, optional: true
  belongs_to :location, optional: true
  belongs_to :user, optional: true
  belongs_to :company, optional: true
  belongs_to :parent_contract, class_name: 'Contract', foreign_key: :parent_contract_id, optional: true
  belongs_to :contractable, polymorphic: true, optional: true
  belongs_to :client, optional: true, foreign_key: :client_id, class_name: 'Company'
  belongs_to :candidate, optional: true
  # belongs_to :buy_company, foreign_key: :buy_company_id, class_name: "Company"

  has_one :child_contract, class_name: 'Contract', foreign_key: :parent_contract_id
  has_one :job_invitation, through: :job_application
  has_many :contract_terms, dependent: :destroy
  has_many :timesheets, dependent: :destroy
  has_many :client_expenses, dependent: :destroy
  has_many :invoices, dependent: :destroy
  has_many :salaries, dependent: :destroy
  has_many :timesheet_logs, through: :timesheets
  has_many :transactions, through: :timesheets
  has_many :timesheet_approvers, through: :timesheets
  has_many :attachable_docs, as: :documentable
  has_many :attachments, as: :attachable
  has_one :sell_contract, dependent: :destroy
  has_one :buy_contract, dependent: :destroy
  has_many :contract_salary_histories, dependent: :destroy
  has_many :expenses, dependent: :destroy
  has_many :csc_accounts
  has_many :contract_admins, as: :admin_able

  has_many :contract_cycles, dependent: :destroy
  has_many :contract_expense, dependent: :destroy
  has_many :contract_books
  has_many :reminders, as: :reminderable

  # has_many :contract_buy_business_details
  # has_many :contract_sell_business_details
  # has_many :contract_sale_commisions

  has_many :activities, as: :trackable, class_name: 'PublicActivity::Activity', dependent: :destroy

  # after_create :set_on_seq
  after_create :insert_attachable_docs, unless: proc { |contract| contract.draft? }
  # after_create :set_next_invoice_date, unless: Proc.new {|contract| contract.draft?}
  # after_create :create_rate_change, unless: Proc.new {|contract| contract.draft?}
  # after_create :notify_recipient, if: Proc.new {|contract| contract.draft? and contract.not_system_generated?}
  # after_create :notify_company_about_contract, if: Proc.new{|contract|contract.parent_contract?}
  after_update :notify_assignee_on_status_change, if: proc { |contract| contract.draft? && contract.saved_change_to_status? && contract.not_system_generated? && contract.assignee? && contract.respond_by.present? && contract.accepted? }
  after_update :notify_companies_admins_on_status_change, if: proc { |contract| contract.draft? && contract.saved_change_to_status? && contract.respond_by.present? && contract.not_system_generated? }
  # after_create :update_contract_application_status
  after_save :create_timesheet, if: proc { |contract| contract.draft? && !contract.has_child? && contract.saved_change_to_status? && contract.is_not_ended? && !contract.timesheets.present? && contract.in_progress? && contract.next_invoice_date.nil? }
  before_create :set_contractable, if: proc { |contract| contract.not_system_generated? }
  before_create :set_sub_contract_attributes, if: proc { |contract| contract.parent_contract? }
  before_create :set_number
  after_create :set_name
  validate :start_date_cannot_be_less_than_end_date, on: :create
  validate :start_date_cannot_be_in_the_past, :next_invoice_date_should_be_in_future, on: :create
  validates :status, inclusion: { in: statuses.keys }
  # validates :billing_frequency ,  inclusion: {in: billing_frequencies.keys}
  # validates :time_sheet_frequency,inclusion: {in: time_sheet_frequencies.keys}
  validates :commission_type, inclusion: { in: commission_types.keys }, on: :update, if: proc { |contract| contract.is_commission }
  # validates :contract_type ,      inclusion: {in: contract_types.keys}
  validates :is_commission, inclusion: { in: [true, false] }
  validates :start_date, :end_date, presence: true
  validates :commission_amount, numericality: true, presence: true, if: proc { |contract| contract.is_commission }
  validates :max_commission, numericality: true, presence: true, if: proc { |contract| contract.is_commission && contract.percentage? }
  validates_uniqueness_of :job_id, scope: :job_application_id, message: 'You have already applied for this Job.', if: proc { |contract| contract.job_application.present? }

  accepts_nested_attributes_for :contract_terms, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :attachments, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :attachable_docs, reject_if: :all_blank
  accepts_nested_attributes_for :job, allow_destroy: true

  accepts_nested_attributes_for :sell_contract, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :buy_contract, allow_destroy: true, reject_if: :all_blank

  # accepts_nested_attributes_for :contract_buy_business_details, allow_destroy: true,reject_if: :all_blank
  # accepts_nested_attributes_for :contract_sell_business_details, allow_destroy: true,reject_if: :all_blank
  # accepts_nested_attributes_for :contract_sale_commisions, allow_destroy: true,reject_if: :all_blank

  # include NumberGenerator.new({prefix: 'C', length: 7})
  default_scope -> { order(created_at: :desc) }

  delegate :set_timesheet_submit, :invoice_generate, :find_next_date, to: :appraiser

  def set_name
    update(cc_job: 0)
    if project_name.to_s.include? "Auto generated"
      update(project_name: "#{id}-#{job.title[0..20]}#{client.present? ? "-#{client.full_name.capitalize}" : ''}")
    end
  end

  def after_create_callbacks
    set_next_invoice_date
    create_rate_change
    notify_recipient if not_system_generated?
  end

  def set_number
    c = Contract.order('created_at DESC').first

    self.number = if c.present?
                    'c_' + (c.number.split('_')[1].to_i + 1).to_s.rjust(3, '0')
                  else
                    'c_001'
                  end
  end

  def only_number
    number.split('_')[1]
  end

  def is_not_ended?
    end_date >= Date.today
  end

  def self.find_sent_or_received(contract_id, obj)
    where('contracts.id = :c_id and (contracts.company_id = :obj_id or (contracts.contractable_id = :obj_id and contracts.contractable_type = :obj_type))', obj_id: obj.id, obj_type: obj.class.name, c_id: contract_id)
  end

  def timesheet_logs_total_time_array
    timesheet_logs.map(&:total_time)
  end

  def invoices?
    invoices.present?
  end

  def parent_contract?
    parent_contract.present?
  end

  def has_child?
    child_contract.present?
  end

  def is_system_generated?
    job_application.present? && job.is_system_generated
  end

  def not_system_generated?
    job_application.present? && !job.is_system_generated
  end

  def attachable_docs?
    attachable_docs.present?
  end

  def signature_required_docs?
    attachable_docs.where(file: nil).joins(:company_doc).where('company_docs.is_required_signature = ?', true).present?
  end

  def is_sent?(current_company)
    company == current_company
  end

  def is_received?(obj)
    contractable_id == obj.id && contractable_type == obj.class.name && contractable_id.present?
  end

  def assignee?
    assignee.present?
  end

  def is_child?
    parent_contract.present?
  end

  def title
    job.title + ' Job - Contract # ' + id.to_s
  end

  def rate
    # self.contract_terms.active.first.rate
    sell_contract&.customer_rate
  end

  def note
    contract_terms.active.first.note
  end

  def terms_and_conditions
    # self.contract_terms.active.first.terms_condition
    '[CHANGE IT terms_and_conditions]'
  end

  def count_contract_admin
    contract_admins.admin.count
  end
  # private

  def set_contractable
    self.contractable = job_application.company unless job_application.is_candidate_applicant?
    return unless job_application.present? && job_application.is_candidate_applicant? && assignee.present?

    self.contractable = company
    self.status = Contract.statuses['accepted']
  end

  def set_sub_contract_attributes
    self.start_date = parent_contract.start_date
    self.end_date = parent_contract.end_date
    parent_contract.accepted!
  end

  def insert_attachable_docs
    company_docs = company.company_docs.where(id: company_doc_ids).includes(:attachment) || []
    company_docs.each do |company_doc|
      attachable_docs.create(company_doc_id: company_doc.id, orignal_file: company_doc.attachment.try(:file))
    end
  end

  def notify_recipient
    job_application.user.notifications.create(message: company.name + " has send you Contract <a href='http://#{contractable.etyme_url + contract_path(self)}'>#{job.title}</a>", title: title) if job_application.present?
  end

  def notify_company_about_contract
    contractable.owner.notifications.create(message: company.name + " has send you Contract <a href='http://#{contractable.etyme_url + contract_path(self)}'>#{job.title}</a>", title: title)
  end

  def notify_assignee_on_status_change
    if accepted?
      assignee.notifications.create(message: respond_by.full_name + " assigned you a contract for <a href='http://#{respond_by.etyme_url + contract_path(self)}'>#{job.title}</a>", title: title)
    else
      assignee.notifications.create(message: "Your contract for <a href='http://#{respond_by.etyme_url + contract_path(self)}'>#{job.title}</a> now #{status.titleize}", title: title)
    end
  end

  def notify_companies_admins_on_status_change
    return unless status == 'in_progress' || status == 'is_ended' || status == 'cancelled' || status == 'paused'

    assignee.notifications.create(message: "Your contract for <a href='http://#{respond_by.etyme_url + contract_path(self)}'>#{job.title}</a> now #{status.titleize}", title: title)
    respond_by.notifications.create(message: "Your contract for <a href='http://#{respond_by.etyme_url + contract_path(self)}'>#{job.title}</a> now #{status.titleize}", title: title)
    created_by.notifications.create(message: "Your contract for <a href='http://#{created_by.etyme_url + contract_path(self)}'>#{job.title}</a> now #{status.titleize}", title: title)

    # admins.each  do |admin|
    #     admin.notifications.create(message: self.applicationable.company.name + " has <a href='http://#{admin.etyme_url + contract_path(self)}'>apply</a> your Job Application - #{self.job.title}",title:"Job Application")
    #   end
    # self.company.all_admins_has_permission?('manage_job_applications') || []
  end

  def next_invoice_date_should_be_in_future
    errors.add(:next_invoice_date, ' should be in future') if next_invoice_date.present? && next_invoice_date < Date.today
  end

  def start_date_cannot_be_less_than_end_date
    errors.add(:start_date, ' cannot be less than end date.') if end_date.blank? || end_date < start_date
  end

  def start_date_cannot_be_in_the_past
    # errors.add(:start_date, "can't be in the past") if start_date.nil? || start_date < Date.today
  end

  def schedule_timesheet
    timesheets.create!(user_id: assignee.id, job_id: job.id, start_date: start_date, company_id: contractable.id, status: 'open')
  end

  def create_timesheet
    update_column(:next_invoice_date, start_date + TIMESHEET_FREQUENCY[time_sheet_frequency].days + 2.days)
    delay(run_at: start_date.to_time).schedule_timesheet
  end

  def self.end_contracts
    Contract.where(end_date: Date.today).each(&:is_ended!)
  end

  def self.start_contracts
    Contract.where(" start_date <='#{Date.today}' ").accepted.each(&:in_progress!)
  end

  def self.invoiced_timesheets
    in_progress.where(next_invoice_date: Date.today).each do |contract|
      contract.invoices.create! unless contract.has_child?
    end
  end

  def extend_cycles(extended_date = nil)
    ActiveRecord::Base.transaction do
      if buy_contract.present?
        buy_contract_time_sheet_cycles(extended_date)
        buy_contract_time_sheet_aprove_cycle(extended_date)
        buy_contract_salary_calculation_cycle(extended_date)
        buy_contract_salary_process_cycle(extended_date)
        buy_contract_salary_clear_cycle(extended_date)
      end
      if sell_contract.present?
        sell_contract_time_sheet_cycles(extended_date)
        sell_contract_time_sheet_aprove_cycle(extended_date)
        sell_contract_invoice_cycle(extended_date)
        sell_contract_client_expense_cycle(extended_date)
        sell_contract_client_expense_approve_cycle(extended_date)
        sell_contract_client_expense_invoice_cycle(extended_date)
      end
    end
  end

  def create_cycles
    ActiveRecord::Base.transaction do
      if buy_contract.present?
        buy_contract_time_sheet_cycles unless contract_cycles.where(cycle_type: 'TimesheetSubmit', cycle_of: buy_contract).present?
        buy_contract_time_sheet_aprove_cycle unless contract_cycles.where(cycle_type: 'TimesheetApprove', cycle_of: buy_contract).present?
        buy_contract_salary_calculation_cycle unless contract_cycles.where(cycle_type: 'SalaryCalculation', cycle_of: buy_contract).present?
        buy_contract_salary_process_cycle unless contract_cycles.where(cycle_type: 'SalaryProcess', cycle_of: buy_contract).present?
        buy_contract_salary_clear_cycle unless contract_cycles.where(cycle_type: 'SalaryClear', cycle_of: buy_contract).present?
      end
      if sell_contract.present?
        sell_contract_time_sheet_cycles unless contract_cycles.where(cycle_type: 'TimesheetSubmit', cycle_of: sell_contract).present? && buy_contract.present?
        sell_contract_time_sheet_aprove_cycle unless contract_cycles.where(cycle_type: 'TimesheetApprove', cycle_of: sell_contract).present?
        sell_contract_invoice_cycle unless contract_cycles.where(cycle_type: 'InvoiceGenerate', cycle_of: sell_contract).present?
        sell_contract_client_expense_cycle unless contract_cycles.where(cycle_type: 'ClientExpenseSubmission', cycle_of: sell_contract).present?
        sell_contract_client_expense_approve_cycle unless contract_cycles.where(cycle_type: 'ClientExpenseApprove', cycle_of: sell_contract).present?
        sell_contract_client_expense_invoice_cycle unless contract_cycles.where(cycle_type: 'ClientExpenseInvoice', cycle_of: sell_contract).present?
      end
    end
  end

  def self.set_cycle
    count = 0
    in_progress.each do |contract|
      contract.set_timesheet_submit(count)
    rescue NoMethodError, RuntimeError, KeyError, ArgumentError
      next

      # contract.contract_cycles.where('end_date > ?', contract.end_date).where.not(cycle_type: ['SalaryClear', 'ClientExpenseApprove', 'ClientExpenseInvoice']).update_all(end_date: contract.end_date)
      # contract.invoice_generate
    end
    # Salary.set_salary_clears
    # ContractSaleCommision.set_commission_clear
    # VendorBill.set_vendor_bill_clear
    # ClientBill.set_client_bill_clear
  end

  # def check_for_ts_approve
  #   timesheets = self.timesheets.where(status: "open")
  #   timesheets.each do |t|
  #     self.contract_cycles.create(company_id: self.company_id,
  #                                 cyclable: t,
  #                                 note: "Timesheet approve",
  #                                 cycle_type: "TimesheetApprove"
  #
  #     )
  #   end
  # end

  def set_next_invoice_date
    update(next_invoice_date: (start_date + sell_contract.invoice_terms_period.to_i.days))
  end

  # tx = ledger.transactions.transact do |builder|
  #   builder.issue(
  #       flavor_id: 'usd',
  #       amount: 10,
  #       source_account_id: 'orande115_ven',
  #       action_tags: {source: 'wire'}
  #   )
  #   builder.issue(
  #       flavor_id: 'min',
  #       amount: 20,
  #       source_account_id: 'cloudepa123_usd'
  #   )
  # end
  #
  #
  #
  # tx = ledger.transactions.transact do |builder|
  #   builder.transfer(
  #       flavor_id: 'usd',
  #       amount: 10,
  #       source_account_id: 'orande115_ven',
  #       destination_account_id: 'cloudepa123_usd'
  #   )
  # end

  def create_rate_change
    # if self.buy_contract
    #   ChangeRate.create(rate: self.buy_contract.payrate.to_i, from_date: self.start_date, to_date: Date.new(9999, 12, 31), rate_type: 'buy', contract: self) unless self.change_rates.where(rate_type: 'buy').present?
    # end
    # if self.sell_contract
    #   ChangeRate.create(rate: self.sell_contract.customer_rate.to_i, from_date: self.start_date, to_date: Date.new(9999, 12, 31), rate_type: 'sell', contract: self) unless self.change_rates.where(rate_type: 'sell').present?
    # end
  end

  def set_on_seq
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    company_name = company&.name
    ledger.keys.create(id: company_name) unless ledger.keys.list.map(&:id).include? company_name
    comp_key = company_name
    # comp_key = ledger.keys.query({aliases: [company_name]}).first
    # unless comp_key.present?
    #   comp_key = ledger.keys.create(id: company_name)
    # end

    # Consultant Expense
    la = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["cons_#{candidate.id}_expense"]
    ).first

    unless la.present?
      ledger.accounts.create(
        id: "cons_#{candidate.id}_expense",
        key_ids: [comp_key],
        quorum: 1
      )
    end

    # Consultant Salary Advance
    la = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["cons_#{candidate.id}_advance"]
    ).first

    unless la.present?
      ledger.accounts.create(
        id: "cons_#{candidate.id}_advance",
        key_ids: [comp_key],
        quorum: 1
      )
    end

    # Consultant Salary Settlement
    la = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["cons_#{candidate.id}_settlement"]
    ).first

    unless la.present?
      ledger.accounts.create(
        id: "cons_#{candidate.id}_settlement",
        key_ids: [comp_key],
        quorum: 1
      )
    end

    # Consultant Salary Process
    la = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["cons_#{candidate.id}_process"]
    ).first

    unless la.present?
      ledger.accounts.create(
        id: "cons_#{candidate.id}_process",
        key_ids: [comp_key],
        quorum: 1
      )
    end

    # Create Consultant Account
    la = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["cons_#{candidate.id}"]
    ).first

    unless la.present?
      ledger.accounts.create(
        id: "cons_#{candidate.id}",
        key_ids: [comp_key],
        quorum: 1
        # tags: {
        #   contract_id: self.id
        # }
      )
    end

    # Create Company/Client
    # company_key = ledger.keys.query({aliases: [company_name.split(',').first.gsub(' ',"_")]}).first
    # unless company_key
    company_key = company_name.split(',').first.tr(' ', '_')
    ledger.keys.create(id: company_name.split(',').first.tr(' ', '_')) unless ledger.keys.list.map(&:id).include? company_key
    # end

    ta = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["comp_#{company.id}_treasury"]
    ).first

    unless ta.present?
      treasury_account = ledger.accounts.create(
        key_ids: [company_key],
        quorum: 1,
        id: "comp_#{company.id}_treasury",
        tags: {
          name: company_name.tr(' ', '_') + '_treasury'
        }
      )
    end

    ea = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["comp_#{company.id}_expense"]
    ).first

    unless ea.present?
      expense_account = ledger.accounts.create(
        key_ids: [company_key],
        quorum: 1,
        id: "comp_#{company.id}_expense",
        tags: {
          name: company_name.tr(' ', '_') + '_expense'
        }
      )
    end

    ue = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["comp_#{company.id}_unidentified_expense"]
    ).first

    unless ue.present?
      unidentified_account = ledger.accounts.create(
        key_ids: [company_key],
        quorum: 1,
        id: "comp_#{company.id}_unidentified_expense",
        tags: {
          name: company_name.tr(' ', '_') + '_unidentified_expense'
        }
      )
    end

    # Create Customer Account

    cust_key = sell_contract.company.name.split(',').first.tr(' ', '_')
    # unless cust_key
    ledger.keys.create(id: sell_contract.company.name.split(',').first.tr(' ', '_')) unless ledger.keys.list.map(&:id).include? cust_key
    # end
    ta = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["cust_#{sell_contract.company.id}_treasury"]
    ).first

    unless ta.present?
      treasury_account = ledger.accounts.create(
        key_ids: [cust_key],
        quorum: 1,
        id: "cust_#{sell_contract.company.id}_treasury",
        tags: {
          name: sell_contract.company&.name.tr(' ', '_') + '_treasury'
        }
      )
    end

    ea = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["cust_#{sell_contract.company.id}_expense"]
    ).first

    unless ea.present?
      expense_account = ledger.accounts.create(
        key_ids: [cust_key],
        quorum: 1,
        id: "cust_#{sell_contract.company.id}_expense",
        tags: {
          name: sell_contract.company&.name.tr(' ', '_') + '_expense'
        }
      )
    end

    ue = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["cust_#{sell_contract.company.id}_unidentified_expense"]
    ).first

    unless ue.present?
      unidentified_account = ledger.accounts.create(
        key_ids: [cust_key],
        quorum: 1,
        id: "cust_#{sell_contract.company.id}_unidentified_expense",
        tags: {
          name: sell_contract.company&.name.tr(' ', '_') + '_unidentified_expense'
        }
      )
    end

    # Create Vendor Account
    if buy_contract.contract_type == 'C2C'
      vendor_key = buy_contract.company.name.split(',').first.tr(' ', '_')
      ledger.keys.create(id: self&.buy_contract.company.name.split(',').first.tr(' ', '_')) unless ledger.keys.list.map(&:id).include? vendor_key

      la = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["vendor_#{buy_contract.company_id}"]
      ).first

      unless la.present?
        ledger.accounts.create(
          id: "vendor_#{buy_contract.company_id}",
          key_ids: [vendor_key],
          quorum: 1
        )
      end

      # create vendor expense

      la = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["vendor_#{buy_contract.company_id}_expense"]
      ).first

      unless la.present?
        ledger.accounts.create(
          id: "vendor_#{buy_contract.company_id}_expense",
          key_ids: [vendor_key],
          quorum: 1
        )
      end

      # create vendor settlement

      la = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["vendor_#{buy_contract.company_id}_settlement"]
      ).first

      unless la.present?
        ledger.accounts.create(
          id: "vendor_#{buy_contract.company_id}_settlement",
          key_ids: [vendor_key],
          quorum: 1
        )
      end

      # create vendor advance
      la = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["vendor_#{buy_contract.company_id}_advance"]
      ).first

      unless la.present?
        ledger.accounts.create(
          id: "vendor_#{buy_contract.company_id}_advance",
          key_ids: [vendor_key],
          quorum: 1
        )
      end

      # create vendor process
      la = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["vendor_#{buy_contract.company_id}_process"]
      ).first

      unless la.present?
        ledger.accounts.create(
          id: "vendor_#{buy_contract.company_id}_process",
          key_ids: [vendor_key],
          quorum: 1
        )
      end

    end

    # Create Commission Account
    csc_accounts.each do |csc|
      la = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["comm_#{csc.id}"]
      ).first

      next if la.present?

      ledger.accounts.create(
        id: "comm_#{csc.id}",
        key_ids: [comp_key],
        quorum: 1,
        tags: {
          contract_id: id,
          accountable_type: csc.accountable_type,
          accountable_id: csc.accountable_id
        }
      )
    end

    # Create Contract Account
    la = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["cont_#{id}"]
    ).first

    unless la.present?
      ledger.accounts.create(
        id: "cont_#{id}",
        key_ids: [comp_key],
        quorum: 1,
        tags: {
          contract_id: id,
          customer_id: sell_contract.company.id,
          company_id: company.id,
          vendor_id: self&.buy_contract.company&.id,
          contract_type: self&.buy_contract.contract_type,
          consulant_id: candidate.id
        }
      )
    end

    # Create Contract Expense Account
    la = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["cont_#{id}" + '_expense']
    ).first
    return if la.present?

    ledger.accounts.create(
      id: "cont_#{id}" + '_expense',
      key_ids: [comp_key],
      quorum: 1,
      tags: {
        contract_id: id,
        customer_id: sell_contract.company.id,
        company_id: company.id,
        vendor_id: self&.buy_contract.company&.id,
        contract_type: self&.buy_contract.contract_type,
        consulant_id: candidate.id
      }
    )
  end

  def contract_progress
    if (Date.today > start_date && Date.today <= end_date) || (Date.today == start_date && Date.today == end_date)
      (((Date.today - start_date) + 1).to_f * 100).to_f / ((end_date - start_date) + 1)
    elsif Date.today == start_date && Date.today <= end_date
      ((Date.today - start_date).to_f * 100).to_f / ((end_date - start_date) + 1)
    elsif Date.today > start_date && Date.today >= end_date
      100.00
    end
  end

  def admin_user
    contract_admins&.first&.user || company.users.joins(:roles).where('roles.name': 'HR admin').limit(1).first
  end

  def notify_contract_companies
    notify_sell_side if sell_contract.present?
    notify_buy_side if buy_contract.present?
  end

  def extended_contract_notification
    ex_notify_sell_side if sell_contract.present?
    ex_notify_buy_side if buy_contract.present?
  end

  private

  def ex_notify_sell_side
    Notification.unread.contract.create(notifiable: sell_contract.team_admin,
                                        createable: created_by,
                                        title: 'Extended Contract',
                                        message: "#{company.full_name.capitalize} has extended the contract '#{project_name}'")
  end

  def ex_notify_buy_side
    candidate.notifications.unread.contract.create(createable: created_by,
                                                   title: 'Extended Contract',
                                                   message: "#{company.full_name.capitalize} has extended the contract '#{project_name}'")
  end

  def notify_sell_side
    Notification.unread.contract.create(notifiable: sell_contract.team_admin,
                                        createable: created_by,
                                        title: 'New Contract',
                                        message: "#{company.full_name.capitalize} has started a new contract '#{project_name}' with your company")
  end

  def notify_buy_side
    candidate.notifications.unread.contract.create(createable: created_by,
                                                   title: 'New Contract',
                                                   message: "#{company.full_name.capitalize} has started a new contract '#{project_name}' with you")
  end

  def appraiser
    Contracts::Cycle.new(self)
  end
end
