# frozen_string_literal: true

# == Schema Information
#
# Table name: candidates
#
#  id                         :integer          not null, primary key
#  first_name                 :string           default("")
#  last_name                  :string           default("")
#  gender                     :integer
#  email                      :string           default(""), not null
#  phone                      :string
#  time_zone                  :string
#  primary_address_id         :integer
#  photo                      :string
#  signature                  :json
#  status                     :integer          default("signup")
#  dob                        :date
#  encrypted_password         :string           default(""), not null
#  reset_password_token       :string
#  reset_password_sent_at     :datetime
#  remember_created_at        :datetime
#  sign_in_count              :integer          default(0), not null
#  current_sign_in_at         :datetime
#  last_sign_in_at            :datetime
#  current_sign_in_ip         :string
#  last_sign_in_ip            :string
#  confirmation_token         :string
#  confirmed_at               :datetime
#  confirmation_sent_at       :datetime
#  unconfirmed_email          :string
#  created_at                 :datetime         not null
#  updated_at                 :datetime         not null
#  invitation_token           :string
#  invitation_created_at      :datetime
#  invitation_sent_at         :datetime
#  invitation_accepted_at     :datetime
#  invitation_limit           :integer
#  invited_by_type            :string
#  invited_by_id              :integer
#  invitations_count          :integer          default(0)
#  resume                     :string
#  skills                     :string
#  description                :string
#  visa                       :integer
#  location                   :string
#  video                      :string
#  category                   :string
#  subcategory                :string
#  dept_name                  :string
#  industry_name              :string
#  video_type                 :string
#  chat_status                :string
#  is_number_verify           :boolean          default(FALSE)
#  is_personal_info_update    :boolean          default(FALSE)
#  is_social_media            :boolean          default(FALSE)
#  is_education_detail_update :boolean          default(FALSE)
#  is_skill_update            :boolean          default(FALSE)
#  is_client_info_update      :boolean          default(FALSE)
#  is_designate_update        :boolean          default(FALSE)
#  is_documents_submit        :boolean          default(FALSE)
#  is_profile_active          :boolean          default(FALSE)
#  selected_from_resume       :string
#  ever_worked_with_company   :string
#  designation_status         :string
#  candidate_visa             :string
#  candidate_title            :string
#  candidate_roal             :string
#  facebook_url               :string
#  twitter_url                :string
#  linkedin_url               :string
#  skypeid                    :string
#  gtalk_url                  :string
#  address                    :string
#  company_id                 :bigint
#  passport_number            :string
#  ssn                        :string
#  relocation                 :boolean          default(FALSE)
#  work_authorization         :string
#  visa_type                  :string
#  latitude                   :float
#  longitude                  :float
#  recruiter_id               :integer
#  phone_country_code         :string
#  provider                   :string
#  uid                        :string
#  online_candidate_status    :string
#
class Candidate < ApplicationRecord
  include HandleErrors
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable and :omniauthable
  devise :invitable, :database_authenticatable, :registerable,
         :recoverable, :rememberable, :trackable, :confirmable

  validates :first_name, presence: true
  validates :last_name, presence: true
  validate :phone_format, if: proc { |candidate| candidate.phone.present? && candidate.phone_country_code.present? }

  enum online_candidate_status: {
    online: 'online',
    in_a_meeting: 'in_a_meeting',
    onway: 'onway',
    offline: 'offline',
  }
  has_paper_trail only: [:address]

  include PublicActivity::Model
  include ArchilliCandidateProfileBuilder
  include OpenaiCandidateProfileBuilder
  include SovrenCandidateProfileBuilder

  geocoded_by :location
  after_validation :geocode

  enum status: %i[signup campany_candidate]
  enum work_type: %i[onsite remote hybrid]
  enum visa: %i[Us_citizen GC OPT OPT_third_party H1B H1B_third_party]

  # validates :password,presence: true,if: Proc.new { |candidate| !candidate.password.nil? }
  # validates :password_confirmation,presence: true,if: Proc.new { |candidate| !candidate.password.nil? }

  after_create :send_invitation_email, if: proc { |candidate| (candidate.invited_by.present? && candidate.send_welcome_email_to_candidate.nil?) || candidate.send_invitation }

  # after_create :send_job_invitation, if: Proc.new{ |candidate| candidate.invited_by.present?}
  after_create :create_address
  after_create :start_matching_jobs
  before_update :start_matching_jobs, if: proc { |candidate| candidate.skill_list_changed? || candidate.industry_name_changed? || candidate.dept_name_changed? }
  after_create :send_welcome_email, if: proc { |candidate| candidate.send_welcome_email_to_candidate.nil? }
  after_create :normalize_candidate_entries, if: proc { |candidate| candidate.signup? }
  # after_create  :set_on_seq
  before_create :set_freelancer_company

  validates :email, presence: :true
  validates_uniqueness_of :email, scope: [:status], message: 'Candidate with same email already exist on the Eytme!', if: proc { |candidate| candidate.signup? }
  validate :email_uniquenes, on: :create, if: proc { |candidate| candidate.status == 'campany_candidate' }
  # validates_numericality_of :phone , on: :update
  # validates :dob, date: { before_or_equal_to: Proc.new { Date.today }, message: " Date Of Birth Can not be in future." } , on: :update
  serialize :dept_name
  serialize :industry_name
  has_many :consultants
  has_many :notifications, as: :notifiable, dependent: :destroy
  has_many :custom_fields, as: :customizable, dependent: :destroy
  has_many :job_applications, as: :applicationable
  has_many :job_invitations, as: :recipient
  has_and_belongs_to_many :matches, class_name: 'Job'
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

  has_many :favourables, as: :favourable, class_name: 'FavouriteChat', dependent: :destroy
  has_many :favourableds, as: :favourabled, class_name: 'FavouriteChat', dependent: :destroy

  # has_many :created_notifications, as: :createable
  has_many :document_signs, as: :signable, dependent: :destroy
  # has_many :partner_following, through: :partner_active_relationships, source: :partner_followed
  # has_many :partner_followers, through: :partner_passive_relationships, source: :partner_follower
  has_many :activities, as: :trackable, class_name: 'PublicActivity::Activity', dependent: :destroy

  belongs_to :invited_by_user, class_name: 'User', foreign_key: :invited_by_id, optional: true
  belongs_to :recruiter, class_name: 'User', foreign_key: :recruiter_id, optional: true
  belongs_to :associated_company, class_name: 'Company', foreign_key: :company_id, optional: true

  has_many :contract_sale_commisions, through: :csc_accounts
  has_many :contract_books, as: :beneficiary
  has_many :legal_documents
  has_many :salaries

  has_many :comments, class_name: 'Comment', foreign_key: :created_by_candidate_id

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
  # scope :search_by, ->(term, _search_scop) { Candidate.joins(:skills).where('lower(tags.name) like :term or lower(first_name) like :term or lower(last_name) like :term or lower(phone) like :term or lower(email) like :term ', term: "%#{term.downcase}%") }

  scope :search_by, ->(term) { Candidate.joins(:skills).where('lower(tags.name) like :term or lower(first_name) like :term or lower(last_name) like :term or lower(phone) like :term or lower(email) like :term ', term: "%#{term.downcase}%") }
  scope :application_status_count, lambda { |candidate, start_date, end_date|
                                     candidate.job_applications.reorder('')
                                              .select('COUNT(*) as count, job_applications.status')
                                              .where(created_at: start_date...end_date)
                                              .where(status: %i[applied prescreen rate_confirmation client_submission interviewing hired])
                                              .group(:status)
                                   }

  # Tags Input
  acts_as_taggable_on :skills, :designates

  validate :max_skill_size

  def phone_format
    errors.add(:phone, "invalid format") if Phonelib.invalid?(phone_country_code + phone)
  end

  def self.from_omniauth(auth)
    candidate = Candidate.where(email: auth.info.email).first
    candidate ||= begin
      full_name = auth.info.name.split(' ')
      first_name = full_name[0]
      last_name = full_name[1] || 'none'
      new_record = Candidate.new(provider: auth.provider, uid: auth.uid, email: auth.info.email, password: Devise.friendly_token[0, 20], first_name: first_name, last_name: last_name, photo: auth.info.image || auth.info.picture_url)
      new_record.skip_confirmation!
      new_record.save!
      new_record
    end
    candidate
  end

  def exp_words
    days = (client_exp + designation_exp)
    days < 365 ? "<div class='value'>#{days}</div> <div class='label'>day(s) experience</div>" : "<div class='value'>#{days / 365}</div><div class='label'>year(s) experience</div>"
  end

  def candidate_exp_words
    days = (client_exp + designation_exp)
    days < 365 ? "<h2>#{days}</h2> <p'>day(s) experience</p>" : "<h2>#{days / 365}</h2><p>year(s) experience</p>"
  end

  def client_exp
    clients.map { |c| (c.end_date - c.start_date).to_i if c.start_date && c.end_date }.compact.sum
  end

  def designation_exp
    designations.map { |c| (c.end_date - c.start_date).to_i if c.start_date && c.end_date }.compact.sum
  end


  def full_experiences
    @full_experiences ||= [clients, designates].flatten
  end

  def full_portfolios
    @full_portfolios ||= [portfolios,
     clients.map(&:portfolios),
     designations.with_no_client.map(&:portfolios)
    ].flatten
  end

  def max_skill_size
    errors[:skill_list] << '8 skills maximum' if skill_list.count > 8
  end

  def conversations
    Conversation.all_onversations(self)
  end

  def etyme_url
    (ENV['app_domain']).to_s
  end

  def full_name
    first_name.capitalize + ' ' + last_name.capitalize
  end

  def full_name_friendly
    self.full_name.split(' ').join('_').downcase

  end

  def get_blacklist_status(black_list_company_id)
    black_listers.find_by(company_id: black_list_company_id)&.status || 'unbanned'
  end

  def self.like_any(fields, values)
    conditions = fields.product(values).map do |(field, value)|
      [arel_table[field].matches("#{value}%"), arel_table[field].matches("% #{value}%")]
    end
    where conditions.flatten.inject(:or)
  end

  def send_invitation_email
    invite! do |u|
      u.skip_invitation = true
    end
    handle_email_errors do
      CandidateMailer.invite_user(self, invited_by).deliver_now
    end
  end

  def already_applied?(job_id)
    job_applications.find_by_job_id(job_id).present?
  end

  def go_available
    self.chat_status = 'available'
    save!
  end

  def go_unavailable
    self.chat_status = 'unavailable'
    save!
  end

  def not_freelancer?
    associated_company.name != 'freelancer'
  end

  def first_resume?
    candidates_resumes.size == 1
  end

  def subscribed?(company_id)
    companies.find_by(id: company_id)
  end

  def candidate_company(company_id)
     CandidatesCompany.where(candidate_id: id,
                            company_id: company_id).first
  end

  def start_matching_jobs
    CandidateJobMatchWorker.perform_async(self.id, 'Candidate')
  end

  def matched_jobs
    jobs = Job.where(listing_type: 'Job', status: 'Published')
    candidate_skills = skill_list.map(&:downcase)

    matched = []
    jobs.each do |job|
      percentage = 0
      matched_skills = job.tag_list.map(&:downcase) & candidate_skills

      unless matched_skills.empty?
        skill_percentage = (matched_skills.count.to_f/candidate_skills.count.to_f)*100
        percentage = skill_percentage*0.6 unless skill_percentage.nil?
        
        percentage += 20 if !dept_name&.empty? and dept_name == job.department
        percentage += 20 if !industry_name&.empty? and industry_name == job.industry
        matched << {:job => job, :percentage => percentage.round(2)} unless percentage.zero?
      end
    end
    matched.sort_by {|c| c[:percentage]}.reverse!
    self.matches = matched.map {|match| match[:job] }
  end

  private

  def create_address
    address = self.addresses.new
    address.save(validate: false)
    update_column(:primary_address_id, address.try(:id))
  end

  # send welcome email to candidate
  def send_welcome_email
    handle_email_errors do
      CandidateMailer.welcome_candidate(self).deliver_now
    end
  end

  # def send_job_invitation
  #   self.invited_by.company.sent_job_invitations.create!( recipient:self , created_by:self.invited_by , job_id: self.job_id.to_i,message:self.message,expiry:self.expiry,invitation_type: self.invitation_type)
  # end
  #

  def normalize_candidate_entries
    a = Candidate.campany_candidate.where(email: email)
    a.each do |candidate|
      cp = CandidatesCompany.where(candidate_id: candidate.id)
      cp.update_all(candidate_id: id)
      # group_ids= candidate.groups.map{|g| g.id}
      # self.update_attribute(:group_ids, group_ids)
      candidate.delete
    end
  end

  def email_uniquenes
    return unless status == 'campany_candidate'

    errors.add(:base, "Candidate with same email exist's in your Company") if invited_by.company.candidates.where(email: email).present?
  end

  def set_on_seq
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )

    candidate_name = full_name

    candidate_key = ledger.keys.query(aliases: [candidate_name]).first
    candidate_key = ledger.keys.create(id: candidate_name) unless candidate_key.present?

    # Create Salary settlement Account
    la = ledger.accounts.list(
      filter: 'id=$1',
      filter_params: ["sal_set_#{id}"]
    ).first

    return if la.present?

    ledger.accounts.create(
      id: "sal_set_#{id}",
      key_ids: [candidate_key],
      quorum: 1,
      tags: {
      }
    )
  end

  def set_freelancer_company
    self.company_id = Company.find_by(company_type: :vendor, domain: 'freelancer.com')&.id if company_id.nil?
  end
end
