class Contract < ApplicationRecord

  include PublicActivity::Model
  tracked params:{ "obj"=> proc {|controller, model_instance| model_instance.changes}}

  include Rails.application.routes.url_helpers

  include CandidateHelper

  enum status:                [ :pending, :accepted , :rejected , :is_ended  , :cancelled , :paused , :in_progress]
  enum billing_frequency:     [ :weekly_invoice, :monthly_invoice  ]
  enum time_sheet_frequency:  [:immediately, :daily,:weekly, :biweekly, "twice a month", :monthly]
  enum commission_type:       [:perhour, :fixed]
  enum contract_type:         [:W2, "1099", :C2C, :contract_independent, :contract_w2 , :contract_C2H_independent , :contract_C2H_w2 , :third_party_crop_to_crop , :third_party_C2H_crop_to_crop]

  CONTRACTABLE = [:company, :candidate]

  attr_accessor :company_doc_ids

  belongs_to :created_by , class_name: 'User' , foreign_key: :created_by_id, optional: true
  belongs_to :respond_by , class_name: 'User' , foreign_key: :respond_by_id, optional: true
  belongs_to :assignee   , class_name: 'User' , foreign_key: :assignee_id, optional: true
  belongs_to :job_application, optional: true
  belongs_to :job, optional: true
  belongs_to :location, optional: true
  belongs_to :user, optional: true
  belongs_to :company, optional: true
  belongs_to :parent_contract , class_name: "Contract" , foreign_key: :parent_contract_id, optional: true
  belongs_to :contractable, polymorphic: true, optional: true
  belongs_to :client, optional: true, foreign_key: :client_id, class_name: "Company"
  belongs_to :candidate, optional: true
  # belongs_to :buy_company, foreign_key: :buy_company_id, class_name: "Company"

  has_one    :child_contract, class_name: "Contract", foreign_key: :parent_contract_id
  has_one    :job_invitation , through: :job_application
  has_many   :contract_terms , dependent: :destroy
  has_many   :timesheets     , dependent: :destroy
  has_many   :invoices       , dependent: :destroy
  has_many   :timesheet_logs , through: :timesheets
  has_many   :transactions   , through: :timesheets
  has_many   :timesheet_approvers   , through: :timesheets
  has_many   :attachable_docs, as: :documentable
  has_many   :attachments , as: :attachable
  has_many   :sell_contracts, dependent: :destroy
  has_many   :buy_contracts, dependent: :destroy
  has_many   :contract_salary_histories, dependent: :destroy

  has_many   :contract_cycles

  # has_many :contract_buy_business_details
  # has_many :contract_sell_business_details
  # has_many :contract_sale_commisions

  after_create :set_on_seq
  after_create :insert_attachable_docs
  after_create :set_next_invoice_date
  after_create :notify_recipient , if: Proc.new{ |contract| contract.not_system_generated? }
  # after_create :notify_company_about_contract, if: Proc.new{|contract|contract.parent_contract?}
  after_update :notify_assignee_on_status_change , if: Proc.new{ |contract| contract.status_changed? && contract.not_system_generated? && contract.assignee? && contract.respond_by.present?  && contract.accepted? }
  after_update :notify_companies_admins_on_status_change, if: Proc.new{|contract| contract.status_changed? && contract.respond_by.present? && contract.not_system_generated?}
  # after_create :update_contract_application_status
  after_save   :create_timesheet, if: Proc.new{|contract| !contract.has_child? && contract.status_changed? && contract.is_not_ended? && !contract.timesheets.present? && contract.in_progress? && contract.next_invoice_date.nil?}
  before_create :set_contractable , if: Proc.new{ |contract| contract.not_system_generated? }
  before_create :set_sub_contract_attributes , if: Proc.new{ |contract| contract.parent_contract? }

  before_create :set_number

  validate  :start_date_cannot_be_less_than_end_date , on: :create
  validate  :start_date_cannot_be_in_the_past , :next_invoice_date_should_be_in_future ,on: :create
  validates :status ,             inclusion: {in: statuses.keys}
  # validates :billing_frequency ,  inclusion: {in: billing_frequencies.keys}
  # validates :time_sheet_frequency,inclusion: {in: time_sheet_frequencies.keys}
  validates :commission_type ,    inclusion: {in: commission_types.keys} , on: :update , if: Proc.new{|contract| contract.is_commission}
  # validates :contract_type ,      inclusion: {in: contract_types.keys}
  validates :is_commission,       inclusion: {in: [ true, false ] }
  validates :start_date, :end_date , presence:   true
  validates :commission_amount  , numericality: true  , presence: true , if: Proc.new{|contract| contract.is_commission}
  validates :max_commission , numericality: true  , presence: true , if: Proc.new{|contract| contract.is_commission && contract.percentage?}
  validates_uniqueness_of :job_id , scope: :job_application_id , message: "You have already applied for this Job." , if: Proc.new{|contract| contract.job_application.present?}

  accepts_nested_attributes_for :contract_terms, allow_destroy: true ,reject_if: :all_blank
  accepts_nested_attributes_for :attachments ,   allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :attachable_docs , reject_if: :all_blank
  accepts_nested_attributes_for :job    , allow_destroy: true

  accepts_nested_attributes_for :sell_contracts, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :buy_contracts, allow_destroy: true,reject_if: :all_blank


  # accepts_nested_attributes_for :contract_buy_business_details, allow_destroy: true,reject_if: :all_blank
  # accepts_nested_attributes_for :contract_sell_business_details, allow_destroy: true,reject_if: :all_blank
  # accepts_nested_attributes_for :contract_sale_commisions, allow_destroy: true,reject_if: :all_blank

  # include NumberGenerator.new({prefix: 'C', length: 7})
  default_scope  -> {order(created_at: :desc)}

  def set_number
    c = Contract.order("created_at DESC").first
    if c.present?
      self.number = "c_" + (c.only_number.to_i + 1).to_s.rjust(3, "0")
    else
      self.number = "c_001"
    end
  end
  
  def only_number
    self.number.split("_")[1]
  end

  def is_not_ended?
    self.end_date >= Date.today
  end

  def self.find_sent_or_received(contract_id , obj)
    where("contracts.id = :c_id and (contracts.company_id = :obj_id or (contracts.contractable_id = :obj_id and contracts.contractable_type = :obj_type))" , {obj_id: obj.id , obj_type: obj.class.name , c_id: contract_id}  )
  end

  def timesheet_logs_total_time_array
    self.timesheet_logs.map(&:total_time)
  end

  def invoices?
    self.invoices.present?
  end

  def parent_contract?
    self.parent_contract.present?
  end

  def has_child?
    self.child_contract.present?
  end

  def is_system_generated?
    self.job_application.present? && self.job.is_system_generated
  end

  def not_system_generated?
    self.job_application.present? && !self.job.is_system_generated
  end

  def attachable_docs?
    self.attachable_docs.present?
  end

  def signature_required_docs?
    self.attachable_docs.where(file:  nil).joins(:company_doc).where('company_docs.is_required_signature = ?' , true).present?
  end

  def is_sent?(current_company)
    self.company == current_company
  end

  def is_received? obj
    self.contractable_id == obj.id && self.contractable_type == obj.class.name && self.contractable_id.present?
  end

  def assignee?
    assignee.present?
  end

  def is_child?
    self.parent_contract.present?
  end

  def title
    self.job.title + " Job - Contract # " + self.id.to_s
  end

  def rate
    # self.contract_terms.active.first.rate
    self.sell_contracts.first.customer_rate
  end

  def note
    self.contract_terms.active.first.note
  end

  def terms_and_conditions
    # self.contract_terms.active.first.terms_condition
    "[CHANGE IT terms_and_conditions]"
  end

  # private

  def set_contractable
    self.contractable = self.job_application.company  if not self.job_application.is_candidate_applicant?
    if self.job_application.present? && self.job_application.is_candidate_applicant? && self.assignee.present?
      self.contractable = self.company
      self.status       = Contract.statuses["accepted"]
    end
  end

  def set_sub_contract_attributes
    self.start_date = self.parent_contract.start_date
    self.end_date   = self.parent_contract.end_date
    self.parent_contract.accepted!
  end

  def insert_attachable_docs
    company_docs = self.company.company_docs.where(id: company_doc_ids).includes(:attachment) || []
    company_docs.each do |company_doc|
      self.attachable_docs.create(company_doc_id: company_doc.id , orignal_file: company_doc.attachment.try(:file))
    end
  end

  def notify_recipient
    self.job_application.user.notifications.create(message: self.company.name+" has send you Contract <a href='http://#{self.contractable.etyme_url + contract_path(self)}'>#{self.job.title}</a>" ,title: self.title) if self.job_application.present?
  end

  def notify_company_about_contract
    self.contractable.owner.notifications.create(message: self.company.name+" has send you Contract <a href='http://#{self.contractable.etyme_url + contract_path(self)}'>#{self.job.title}</a>" ,title: self.title)
  end

  def notify_assignee_on_status_change
    if self.accepted?
      self.assignee.notifications.create(message: self.respond_by.full_name+" assigned you a contract for <a href='http://#{self.respond_by.etyme_url + contract_path(self)}'>#{self.job.title}</a>" ,title: self.title)
    else
      self.assignee.notifications.create(message: "Your contract for <a href='http://#{self.respond_by.etyme_url + contract_path(self)}'>#{self.job.title}</a> now #{self.status.titleize}" ,title: self.title)
    end
  end

  def notify_companies_admins_on_status_change
    if self.status == "in_progress" || self.status == "is_ended" || self.status == "cancelled" || self.status == "paused"
      self.assignee.notifications.create(message: "Your contract for <a href='http://#{self.respond_by.etyme_url + contract_path(self)}'>#{self.job.title}</a> now #{self.status.titleize}" ,title: self.title)
      self.respond_by.notifications.create(message: "Your contract for <a href='http://#{self.respond_by.etyme_url + contract_path(self)}'>#{self.job.title}</a> now #{self.status.titleize}" ,title: self.title)
      self.created_by.notifications.create(message: "Your contract for <a href='http://#{self.created_by.etyme_url + contract_path(self)}'>#{self.job.title}</a> now #{self.status.titleize}" ,title: self.title)
    end

    # admins.each  do |admin|
    #     admin.notifications.create(message: self.applicationable.company.name + " has <a href='http://#{admin.etyme_url + contract_path(self)}'>apply</a> your Job Application - #{self.job.title}",title:"Job Application")
    #   end
    # self.company.all_admins_has_permission?('manage_job_applications') || []
  end

  def next_invoice_date_should_be_in_future
    errors.add(:next_invoice_date,' should be in future')  if self.next_invoice_date.present? && self.next_invoice_date < Date.today
  end

  def start_date_cannot_be_less_than_end_date
      errors.add(:start_date, ' cannot be less than end date.') if self.end_date.blank? || self.end_date < self.start_date
  end

  def start_date_cannot_be_in_the_past
      # errors.add(:start_date, "can't be in the past") if start_date.nil? || start_date < Date.today
  end

  def schedule_timesheet
    self.timesheets.create!(user_id: self.assignee.id , job_id: self.job.id ,start_date: self.start_date , company_id: self.contractable.id , status: 'open')
  end

  def create_timesheet
    self.update_column(:next_invoice_date, self.start_date + TIMESHEET_FREQUENCY[self.time_sheet_frequency].days + 2.days)
    self.delay(run_at: self.start_date.to_time).schedule_timesheet
  end

  def self.end_contracts
    Contract.where(end_date: Date.today).each do |contract|
      contract.is_ended!
    end
  end

  def self.start_contracts
    Contract.where(" start_date <='#{Date.today.to_s}' ").accepted.each do |contract|
      contract.in_progress!
    end
  end

  def self.invoiced_timesheets
    self.in_progress.where({next_invoice_date: Date.today}).each do |contract|
      contract.invoices.create! if !contract.has_child?
    end
  end

  def self.set_cycle
    self.in_progress.each do |contract|
      contract.check_for_ts_submit
      # contract.check_for_ts_approve
    end
  end

  def check_for_ts_submit
    ts_cycle = self.contract_cycles.where(cycle_type: "TimesheetSubmit").order("created_at DESC").first
    buy_contract = self.buy_contracts.first
    if ts_cycle.present?
      next_date =  get_next_date(ts_cycle.cycle_date,
                    buy_contract.time_sheet,
                    buy_contract.ts_date_1,
                    buy_contract.ts_date_2,
                    buy_contract.ts_end_of_month,
                    buy_contract.ts_day_of_week,
                    ts_cycle.cycle_date )

      start_date = ts_cycle.cycle_date + 1.day
      while next_date <= Time.now
        cycle = self.contract_cycles.create(candidate_id: buy_contract.candidate_id,
                                    note: "Timesheet submit",
                                    cycle_date: next_date,
                                    start_date: start_date,
                                    end_date: next_date,
                                    cycle_type: "TimesheetSubmit"

        )

       t = Timesheet.create(
            contract_id: self.id,
            start_date: start_date,
            end_date: next_date,
            candidate_name: buy_contract.candidate.full_name,
            candidate_id: buy_contract.candidate_id,
            ts_cycle_id: cycle.id
        )

        next_date =  get_next_date(next_date,
                                   buy_contract.time_sheet,
                                   buy_contract.ts_date_1,
                                   buy_contract.ts_date_2,
                                   buy_contract.ts_end_of_month,
                                   buy_contract.ts_day_of_week,
                                   next_date)
        start_date = cycle.cycle_date + 1.day
      end
    else
      next_date =  get_next_date(self.start_date-1.day,
                                 buy_contract.time_sheet,
                                 buy_contract.ts_date_1,
                                 buy_contract.ts_date_2,
                                 buy_contract.ts_end_of_month,
                                 buy_contract.ts_day_of_week,
                                 Time.now)
      start_date = self.start_date
      while next_date <= Time.now
        cycle = self.contract_cycles.create(candidate_id: buy_contract.candidate_id,
                                    note: "Timesheet submit",
                                    cycle_date: next_date,
                                    start_date: start_date,
                                    end_date: next_date,
                                    cycle_type: "TimesheetSubmit"
        )

        t = Timesheet.create(
            contract_id: self.id,
            start_date: start_date,
            end_date: next_date,
            candidate_name: buy_contract.candidate.full_name,
            candidate_id: buy_contract.candidate_id,
            ts_cycle_id: cycle.id
        )
        next_date =  get_next_date(next_date,
                                   buy_contract.time_sheet,
                                   buy_contract.ts_date_1,
                                   buy_contract.ts_date_2,
                                   buy_contract.ts_end_of_month,
                                   buy_contract.ts_day_of_week,
                                   next_date)
        start_date = cycle.cycle_date + 1.day

      end
    end
  end

  def check_for_ts_approve
    timesheets = self.timesheets.where(status: "open")
    timesheets.each do |t|
      self.contract_cycles.create(company_id: self.company_id,
                                  cyclable: t,
                                  note: "Timesheet approve",
                                  cycle_type: "TimesheetApprove"

      )
    end
  end

  def set_next_invoice_date
    self.update(next_invoice_date: (self.start_date + self.sell_contracts.first.invoice_terms_period.to_i.days) )
  end

  #

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



  def set_on_seq
    ledger = Sequence::Client.new(
      ledger_name: ENV['seq_ledgers'],
      credential: ENV['seq_token']
    )

    com_key = ledger.keys.query({aliases: ['company']}).first
    unless com_key.present?
      com_key = ledger.keys.create(id: "company")
    end

    con_key = ledger.keys.query({aliases: ['consultant']}).first
    unless con_key.present?
      con_key = ledger.keys.create(id: "consultant")
    end

    contract_key = ledger.keys.query({aliases: ['contract']}).first
    unless contract_key.present?
      contract_key = ledger.keys.create(id: "contract")
    end

    if self.sell_contracts.first.company_id.present?
      tre_q = ledger.accounts.list(
          filter: 'id=$1',
          filter_params: ["#{self.sell_contracts.first.company.slug.to_s + self.sell_contracts.first.company.id.to_s}_q"]).first

      ledger.accounts.create(
          id: "#{self.sell_contracts.first.company.slug.to_s + self.sell_contracts.first.company.id.to_s}_q",
          keys: [com_key],
          quorum: 1,
          tags: {
              domain: self.sell_contracts.first.company.domain,
              primary_email: self.sell_contracts.first.company.owner.email
          }
      ) unless tre_q.present?

      tre_usd = ledger.accounts.list(
          filter: 'id=$1',
          filter_params: ["#{self.sell_contracts.first.company.slug.to_s + self.sell_contracts.first.company.id.to_s}_usd"]).first

      ledger.accounts.create(
          id: "#{self.sell_contracts.first.company.slug.to_s + self.sell_contracts.first.company.id.to_s}_usd",
          keys: [com_key],
          quorum: 1,
          tags: {
              domain: self.sell_contracts.first.company.domain,
              primary_email: self.sell_contracts.first.company.owner.email
          }
      ) unless tre_usd.present?
    end

    if self.buy_contracts.first.company_id.present?
      # Contract Vendor Tressury account
      cvt = ledger.accounts.list(
          filter: 'id=$1',
          filter_params: ["#{self.buy_contracts.first.company.slug.to_s + self.buy_contracts.first.company.id.to_s}_ven"]).first

      ledger.accounts.create(
        id: "#{self.buy_contracts.first.company.slug.to_s + self.buy_contracts.first.company.id.to_s}_ven",
        keys: [com_key],
        quorum: 1,
        tags: {
          domain: self.buy_contracts.first.company.domain,
          primary_email: self.buy_contracts.first.company.owner.email
        }
      ) unless cvt.present?
    end

    # Contract Expense
    la = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["#{self.number}_exp"]).first

    ledger.accounts.create(
      id: "#{self.number}_exp",
      keys: [contract_key],
      quorum: 1,
      tags: {
        contract_id: self.id
      }
    ) unless la.present?

    # Consultant account
    ca_q = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["#{self.buy_contracts.first.candidate.full_name.parameterize + self.buy_contracts.first.candidate.id.to_s}_q"]).first

    ledger.accounts.create(
      id: "#{self.buy_contracts.first.candidate.full_name.parameterize + self.buy_contracts.first.candidate.id.to_s}_q",
      keys: [con_key],
      quorum: 1,
      tags: {
        name: self.buy_contracts.first.candidate.full_name,
        id: self.buy_contracts.first.candidate.id
      }
    ) unless ca_q.present?

    ca_usd = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["#{self.buy_contracts.first.candidate.full_name.parameterize + self.buy_contracts.first.candidate.id.to_s}_usd"]).first

    ledger.accounts.create(
        id: "#{self.buy_contracts.first.candidate.full_name.parameterize + self.buy_contracts.first.candidate.id.to_s}_usd",
        keys: [con_key],
        quorum: 1,
        tags: {
            name: self.buy_contracts.first.candidate.full_name,
            id: self.buy_contracts.first.candidate.id
        }
    ) unless ca_usd.present?

    ca_exp = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["#{self.buy_contracts.first.candidate.full_name.parameterize + self.buy_contracts.first.candidate.id.to_s}_exp"]).first

    ledger.accounts.create(
        id: "#{self.buy_contracts.first.candidate.full_name.parameterize + self.buy_contracts.first.candidate.id.to_s}_exp",
        keys: [con_key],
        quorum: 1,
        tags: {
            name: self.buy_contracts.first.candidate.full_name,
            id: self.buy_contracts.first.candidate.id
        }
    ) unless ca_exp.present?


    # Commission Account
    self.buy_contracts.first.contract_sale_commisions.each do |csc|
      csc.csc_accounts.each do |csca|

        temp_com = ledger.accounts.list(
            filter: 'id=$1',
            filter_params: ["#{csca.accountable.full_name.parameterize + csca.accountable.id.to_s}_com"]).first

        ledger.accounts.create(
            id: "#{csca.accountable.full_name.parameterize + csca.accountable.id.to_s}_com",
            keys: [con_key],
            quorum: 1,
            tags: {
                name: csca.accountable.full_name.parameterize
            }
        ) unless temp_com.present?
      end
    end

    ca_exp = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["#{self.buy_contracts.first.candidate.full_name.parameterize + self.buy_contracts.first.candidate.id.to_s}_exp"]).first

    ledger.accounts.create(
        id: "#{self.buy_contracts.first.candidate.full_name.parameterize + self.buy_contracts.first.candidate.id.to_s}_exp",
        keys: [con_key],
        quorum: 1,
        tags: {
            name: self.buy_contracts.first.candidate.full_name,
            id: self.buy_contracts.first.candidate.id
        }
    ) unless ca_exp.present?




    # key = ledger.keys.create(id: self.display_number)
    # account = ledger.accounts.create(
    #     alias: "comp#{self.company_id}_#{self.number}",
    #     keys: [key],
    #     quorum: 1,
    #     tags: {
    #       id: self.company_id,
    #       name: self.company.full_name,
    #       email: self.company.email,
    #       phone: self.company.phone
    #     }
    # )

    # account = ledger.accounts.create(
    #       id: "cntrct#{self.id}_#{self.number}",
    #       keys: [key],
    #       quorum: 1,
    #       tags: {
    #           comp_id:"comp_#{self.company_id}",
    #           cand_vend_id:"cand_#{self.sell_contracts.first.company_id}",
    #           cust_id:"cust_#{self.buy_contracts.first.candidate_id}",
    #           start_date: self.start_date,
    #           end_date: self.end_date,
    #           buy_rate: self.buy_contracts.first.payrate,
    #           sell_rate: self.sell_contracts.first.customer_rate,
    #           contract_duration:"#{self.start_date} TO #{self.end_date}",
    #           sell_timesheet_type: self.sell_contracts.first.time_sheet,
    #           sell_invoice_type: self.sell_contracts.first.invoice_terms_period,
    #           buy_timesheet_type: self.buy_contracts.first.time_sheet,
    #           hire: self.buy_contracts.first.contract_type,
    #           status: self.status
    #       }
    # )
    #
    # account = ledger.accounts.create(
    #   alias: "cust#{self.buy_contracts.first.candidate_id}_#{self.number}",
    #   keys: [key],
    #   quorum: 1,
    #   tags: {
    #       id: self.buy_contracts.first.candidate.id,
    #       name: self.buy_contracts.first.candidate.full_name,
    #       email: self.buy_contracts.first.candidate.email,
    #       phone: self.buy_contracts.first.candidate.phone
    #   }
    # )
    #
    #
    # if self.buy_contracts.first.company_id.present?
    #   account = ledger.accounts.create(
    #                                      alias: "vend#{self.buy_contracts.first.company.id}_#{self.number}",
    #                                      keys: [key],
    #                                      quorum: 1,
    #                                      tags: {
    #                                          id: self.buy_contracts.first.company.id,
    #                                          name: self.buy_contracts.first.company.full_name,
    #                                          email: self.buy_contracts.first.company.email,
    #                                          phone: self.buy_contracts.first.company.phone
    #                                      }
    #   )
    # end
  end

end
