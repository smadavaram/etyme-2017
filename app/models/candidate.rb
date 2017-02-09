class Candidate < ActiveRecord::Base
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable and :omniauthable
  devise :invitable, :database_authenticatable, :registerable,
         :recoverable, :rememberable, :trackable

  enum status: [:signup, :campany_candidate]

  # validates :password,presence: true,if: Proc.new { |candidate| !candidate.password.nil? }
  # validates :password_confirmation,presence: true,if: Proc.new { |candidate| !candidate.password.nil? }

  after_create  :send_invitation_email  , if: Proc.new{|candidate|candidate.invited_by.present? && candidate.send_welcome_email_to_candidate.nil?}

  # after_create :send_job_invitation, if: Proc.new{ |candidate| candidate.invited_by.present?}
  after_create  :create_address
  after_create  :send_welcome_email, if: Proc.new{|candidate| candidate.send_welcome_email_to_candidate.nil?}
  after_create  :normalize_candidate_entries, if: Proc.new{|candidate| candidate.signup?}


  validates :email,presence: :true
  validates_uniqueness_of :email ,scope: [:status], message: "Candidate with same email already exist on the Eytme!" ,if: Proc.new{|candidate| candidate.signup?}
  validate :email_uniquenes ,on: :create,if: Proc.new{|candidate| candidate.status == "campany_candidate"}
  # validates_numericality_of :phone , on: :update
  # validates :dob, date: { before_or_equal_to: Proc.new { Date.today }, message: " Date Of Birth Can not be in future." } , on: :update

  has_many   :consultants
  has_many   :notifications       , as: :notifiable             ,dependent: :destroy
  has_many   :custom_fields       , as: :customizable           ,dependent: :destroy
  has_many   :job_applications    , as: :applicationable
  has_many   :job_invitations     , as: :recipient
  has_many   :contracts           , through: :job_applications   ,dependent: :destroy
  has_many   :job_invitations     , as: :recipient
  has_many   :educations          , dependent: :destroy          ,foreign_key: 'user_id'
  has_many   :experiences         , dependent: :destroy          ,foreign_key: 'user_id'
  has_many :candidates_companies  ,dependent: :destroy
  has_many :companies , through: :candidates_companies ,dependent: :destroy
  belongs_to :address             , foreign_key: :primary_address_id
  has_and_belongs_to_many :groups ,through: :company

  attr_accessor :job_id , :expiry , :message , :invitation_type
  attr_accessor :send_welcome_email_to_candidate



  accepts_nested_attributes_for :experiences ,reject_if: :all_blank, allow_destroy: true
  accepts_nested_attributes_for :educations  ,reject_if: :all_blank, allow_destroy: true
  accepts_nested_attributes_for :address   , reject_if: :all_blank, update_only: true

  #Tags Input
  acts_as_taggable_on :skills


  def etyme_url
    Rails.env.development? ? "#{ENV['domain']}:3000" : "#{ENV['domain']}"
  end



  def photo
    super.present? ? super : 'avatars/male.png'
  end

  def full_name
    self.first_name + " " + self.last_name
  end

  # protected
  #   def password_required?
  #     return false if skip_password_validation
  #     super
  #   end


  def send_invitation_email
    CandidateMailer.invite_user(self,self.invited_by).deliver_now
  end

  def is_already_applied? job_id
    self.job_applications.find_by_job_id(job_id).present?
  end

  private

  def create_address
    address= Address.new
    address.save(validate: false)
    self.update_column(:primary_address_id , address.try(:id))
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
      if self.invited_by.company.candidates.where(email:self.email).present?
        errors.add(:base,"Candidate with same email exist's in your Company")
      end
    end
  end


end
