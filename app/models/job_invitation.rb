# == Schema Information
#
# Table name: job_invitations
#
#  id             :integer          not null, primary key
#  receipent_id   :integer
#  receipent_type :string
#  sender_id      :integer
#  job_id         :integer
#  status         :integer          default(0)
#  created_at     :datetime         not null
#  updated_at     :datetime         not null
#

class JobInvitation < ActiveRecord::Base

  enum status: { pending: 0, accepted: 1 , rejected: 2 }

  #Validations
  validates :expiry , presence: true,date: { after_or_equal_to: Proc.new { Date.today }, message: "Date must be at least #{(Date.today ).to_s}" }

  #Associations
  belongs_to :created_by , class_name: "User" ,foreign_key: :created_by_id
  belongs_to :recipient , polymorphic: true
  belongs_to :job
  has_one :company , through: :job
  has_many :custom_fields ,as: :customizable


  #CallBacks
  # after_create :send_invitation_mail
  after_create :notify_recipient
  after_update :notify_on_status_change, if: Proc.new{|invitation| invitation.status_changed?}


  #Nested Attributes
  accepts_nested_attributes_for :custom_fields , reject_if: :all_blank

  #Scopes
  scope :pending , -> {where(status: 0)}
  scope :accepted , -> {where(status: 1)}
  scope :rejected , -> {where(status: 2)}

  private


    # Call after create
    def notify_recipient
      self.recipient.notifications.create(message: self.company.name+" has invited you for "+self.job.title ,title:"Job Invitation")
    end

    # Call after update
    def notify_on_status_change
      self.created_by.notifications.create(message: self.recipient.full_name+" has "+ self.status+" your request for "+self.job.title ,title:"Job Invitation")
    end

    # # Call after create
    # def send_invitation_mail
    #   JobMailer.send_job_invitation(self).deliver
    # end

    # def niti
    #   self.recipient.notifications.create()
    # end
end
