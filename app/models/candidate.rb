class Candidate < ApplicationRecord
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable and :omniauthable
  devise :invitable, :database_authenticatable, :registerable,
         :recoverable, :rememberable, :trackable #, :confirmable
  validates :first_name, presence: true
  validates :last_name, presence: true
  has_paper_trail only: [:address]

  include PublicActivity::Model
  include ArchilliCandidateProfileBuilder
  include SovrenCandidateProfileBuilder

  geocoded_by :location
  after_validation :geocode

  enum status: [:signup, :campany_candidate]
  enum visa: [:Us_citizen, :GC, :OPT, :OPT_third_party, :H1B, :H1B_third_party]

  # validates :password,presence: true,if: Proc.new { |candidate| !candidate.password.nil? }
  # validates :password_confirmation,presence: true,if: Proc.new { |candidate| !candidate.password.nil? }

  after_create :send_invitation_email, if: Proc.new {|candidate| (candidate.invited_by.present? && candidate.send_welcome_email_to_candidate.nil?) || candidate.send_invitation}

  # after_create :send_job_invitation, if: Proc.new{ |candidate| candidate.invited_by.present?}
  after_create :create_address
  after_create :send_welcome_email, if: Proc.new {|candidate| candidate.send_welcome_email_to_candidate.nil?}
  after_create :normalize_candidate_entries, if: Proc.new {|candidate| candidate.signup?}
  # after_create  :set_on_seq
  before_create :set_freelancer_company

  validates :email, presence: :true
  validates_uniqueness_of :email, scope: [:status], message: "Candidate with same email already exist on the Eytme!", if: Proc.new {|candidate| candidate.signup?}
  validate :email_uniquenes, on: :create, if: Proc.new {|candidate| candidate.status == "campany_candidate"}
  # validates_numericality_of :phone , on: :update
  # validates :dob, date: { before_or_equal_to: Proc.new { Date.today }, message: " Date Of Birth Can not be in future." } , on: :update
  serialize :dept_name
  serialize :industry_name
  has_many :consultants
  has_many :notifications, as: :notifiable, dependent: :destroy
  has_many :custom_fields, as: :customizable, dependent: :destroy
  has_many :job_applications, as: :applicationable
  has_many :job_invitations, as: :recipient
  has_many :contracts, through: :job_applications, dependent: :destroy
  has_many :job_invitations_sender, as: :sender, class_name: 'JobInvitation'

  has_many :educations, dependent: :destroy, foreign_key: 'user_id'
  has_many :experiences, dependent: :destroy, foreign_key: 'user_id'
  has_many :candidates_companies, dependent: :destroy
  has_many :companies, through: :candidates_companies, dependent: :destroy
  has_many :candidates_resumes, dependent: :destroy
  has_many :csc_accounts, as: :accountable


  has_many :addresses, as: :addressable
  # belongs_to :address              , foreign_key: :primary_address_id, optional: true

  # has_and_belongs_to_many :groups ,through: :company
  has_many :groupables, as: :groupable, dependent: :destroy
  has_many :groups, through: :groupables
  has_many :comments, as: :commentable
  has_many :reminders, as: :reminderable
  has_many :messages, as: :messageable, dependent: :destroy
  has_many :chats, as: :chatable
  has_many :statuses, as: :statusable, dependent: :destroy
  has_many :portfolios, as: :portfolioable, dependent: :destroy
  has_many :conversation_messages, as: :userable
  has_many :certificates, dependent: :destroy
  has_many :clients, dependent: :destroy
  has_many :designations, dependent: :destroy
  has_many :timesheets, dependent: :destroy
  has_many :contract_salary_histories, dependent: :destroy
  has_many :contract_cycles, dependent: :destroy
  has_many :documents, dependent: :destroy
  has_many :criminal_check, dependent: :destroy
  has_many :visas, dependent: :destroy
  has_many :legal_documents, dependent: :destroy
  has_many :client_expenses, dependent: :destroy
  has_many :black_listers, as: :blacklister

  has_many :favourables, as: :favourable, class_name: "FavouriteChat", dependent: :destroy
  has_many :favourableds, as: :favourabled, class_name: "FavouriteChat", dependent: :destroy

  has_many :created_notifications, as: :createable
  has_many :document_signs, as: :signable, dependent: :destroy
  # has_many :partner_following, through: :partner_active_relationships, source: :partner_followed
  # has_many :partner_followers, through: :partner_passive_relationships, source: :partner_follower
  has_many :activities, as: :trackable, class_name: 'PublicActivity::Activity', dependent: :destroy

  belongs_to :invited_by_user, class_name: "User", foreign_key: :invited_by_id, optional: true
  belongs_to :associated_company, class_name: "Company", foreign_key: :company_id, optional: true

  has_many :contract_sale_commisions, through: :csc_accounts
  has_many :contract_books, as: :beneficiary
  has_many :legal_documents
  has_many :salaries

  attr_accessor :job_id, :expiry, :message, :invitation_type
  attr_accessor :send_welcome_email_to_candidate
  attr_accessor :send_invitation
  attr_accessor :invitation_as_contact


  accepts_nested_attributes_for :portfolios, reject_if: :all_blank, allow_destroy: true
  accepts_nested_attributes_for :experiences, reject_if: :all_blank, allow_destroy: true
  accepts_nested_attributes_for :educations, reject_if: :all_blank, allow_destroy: true
  accepts_nested_attributes_for :addresses, reject_if: :all_blank, update_only: true, allow_destroy: true
  accepts_nested_attributes_for :custom_fields, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :certificates, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :clients, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :designations, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :documents, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :criminal_check, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :visas, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :legal_documents, allow_destroy: true, reject_if: :all_blank


  scope :search_by, ->term,search_scop{Candidate.joins(:skills).where('lower(tags.name) like :term or lower(first_name) like :term or lower(last_name) like :term or lower(phone) like :term or lower(email) like :term ', {term: "%#{term.downcase}%"})}
  scope :application_status_count, ->(candidate,start_date, end_date) {candidate.job_applications.reorder('')
                                                                 .select('COUNT(*) as count, job_applications.status')
                                                                 .where(created_at: start_date...end_date)
                                                                 .where(status: [:applied, :prescreen, :rate_confirmation, :client_submission, :interviewing, :hired])
                                                                 .group(:status)}


  #Tags Input
  acts_as_taggable_on :skills, :designates

  validate :max_skill_size
  def exp_words
    days = (client_exp + designation_exp)
    days < 365 ? "<div class='value'>#{days }</div> <div class='label'>day(s) experience</div>" : "<div class='value'>#{days/365}</div><div class='label'>year(s) experience</div>"
  end
  def client_exp
    clients.map{|c| (c.end_date - c.start_date).to_i if c.start_date and c.end_date }.compact.sum
  end

  def designation_exp
    designations.map{|c| (c.end_date - c.start_date).to_i if c.start_date and c.end_date }.compact.sum
  end

  def max_skill_size
    errors[:skill_list] << "8 skills maximum" if skill_list.count > 8
  end

  def conversations
    Conversation.all_onversations(self)
  end

  def etyme_url
    Rails.env.development? ? "#{ENV['domain']}" : "#{ENV['domain']}"
  end
  def full_name
    self.first_name + " " + self.last_name
  end

  def get_blacklist_status(black_list_company_id)
    self.black_listers.find_by(company_id: black_list_company_id)&.status || 'unbanned'
  end

  def self.like_any(fields, values)
    conditions = fields.product(values).map do |(field, value)|
      [arel_table[field].matches("#{value}%"), arel_table[field].matches("% #{value}%")]
    end
    where conditions.flatten.inject(:or)
  end

  # protected
  #   def password_required?
  #     return false if skip_password_validation
  #     super
  #   end


  def send_invitation_email
    invite! do |u|
      u.skip_invitation = true
    end
    CandidateMailer.invite_user(self, self.invited_by).deliver_now
  end

  def is_already_applied? job_id
    self.job_applications.find_by_job_id(job_id).present?
  end

  def go_available
    self.chat_status = "available"
    self.save!
  end

  def go_unavailable
    self.chat_status = "unavailable"
    self.save!
  end

  def not_freelancer?
    associated_company.name != 'freelancer'
  end

  def first_resume?
    candidates_resumes.count == 1
  end
  private

  def create_address
    address = Address.new
    address.save(validate: false)
    self.update_column(:primary_address_id, address.try(:id))
  end

  # send welcome email to candidate
  def send_welcome_email
    CandidateMailer.welcome_candidate(self).deliver_now
  end

  # def send_job_invitation
  #   self.invited_by.company.sent_job_invitations.create!( recipient:self , created_by:self.invited_by , job_id: self.job_id.to_i,message:self.message,expiry:self.expiry,invitation_type: self.invitation_type)
  # end
  #

  #
  def normalize_candidate_entries
    a = Candidate.campany_candidate.where(email: self.email)
    a.each do |candidate|
      cp = CandidatesCompany.where(candidate_id: candidate.id)
      cp.update_all(candidate_id: self.id)
      # group_ids= candidate.groups.map{|g| g.id}
      # self.update_attribute(:group_ids, group_ids)
      candidate.delete
    end
  end

  def email_uniquenes
    if self.status == "campany_candidate"
      if self.invited_by.company.candidates.where(email: self.email).present?
        errors.add(:base, "Candidate with same email exist's in your Company")
      end
    end
  end



  def set_on_seq
    ledger = Sequence::Client.new(
        ledger_name: 'company-dev',
        credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )

    candidate_name = self.full_name

    candidate_key = ledger.keys.query({aliases: [candidate_name]}).first
    unless candidate_key.present?
      candidate_key = ledger.keys.create(id: candidate_name)
    end

    # Create Salary settlement Account
    la = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["sal_set_#{self.id}"]).first
    ledger.accounts.create(
        id: "sal_set_#{self.id}",
        key_ids: [candidate_key],
        quorum: 1,
        tags: {
        }
    ) unless la.present?
  end



  def set_freelancer_company
    self.company_id = Company.find_by(company_type: :vendor, domain: 'freelancer.com')&.id if self.company_id.nil?
  end

end
