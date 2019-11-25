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

class JobInvitation < ApplicationRecord


  include Rails.application.routes.url_helpers


  enum status: {pending: 0, accepted: 1, rejected: 2}
  enum invitation_type: [:vendor, :candidate, :by_email]

  enum invitation_purpose: [:job, :bench]

  validates :status, inclusion: {in: statuses.keys}
  validate :is_active?
  # validates :expiry , presence: true,date: { after_or_equal_to: Proc.new { Date.today }, message: "Date must be at least #{(Date.today ).to_s}" }

  belongs_to :created_by, class_name: "User", foreign_key: :created_by_id, optional: true
  belongs_to :recipient, polymorphic: true, optional: true
  belongs_to :sender, polymorphic: true, optional: true


  belongs_to :company, optional: true
  belongs_to :job, optional: true
  has_one :job_application
  has_one :contract, through: :job_application

  # after_create :send_invitation_mail
  after_create :associate_invitation_with_candidate, if: Proc.new { |invitation| invitation.email.present? }
  after_update :reject_request, if: Proc.new { |invitation| invitation.accepted? && invitation.bench? }

  after_create :notify_recipient
  after_update :notify_on_status_change, if: Proc.new { |invitation| invitation.status_changed? }


  attr_accessor :email, :first_name, :last_name

  # ransack_alias(:recipient, :recipient_of_User_type_email_or_recipient_of_User_type_first_name)
  # ransack_alias(:created_by , :created_by_first_name_or_created_by_last_name)


  def is_active?
    self.expiry >= Date.today
  end

  def is_sent? company
    self.company == company
  end


  private
  def reject_request
    if self.sender_type.eql?('Candidate')
      JobInvitation.where(sender_id: self.sender_id).bench.pending.update_all(status: :rejected)
      JobInvitation.where(recipient_id: self.sender_id,recipient_type: 'Candidate').bench.pending.update_all(status: :rejected)

    end
    if self.recipient_type.eql?('Candidate')
      JobInvitation.where(recipient_id: self.recipient_id).bench.pending.update_all(status: :rejected)
      JobInvitation.where(sender_id: self.recipient_id,sender_type: 'Candidate').bench.pending.update_all(status: :rejected)

    end
  end

  # Call after create
  def notify_recipient
    if self.recipient_type == "Candidate"
      self.job ?
          self.recipient.notifications.create(message: self.company.name + " has invited you for <a href='http://#{self.recipient.etyme_url + job_invitation_path(self)}'>#{self.job&.title}</a> <br/> <p> #{self.message} </p>", title: "Job Invitation",createable: created_by)
          :
          self.recipient.notifications.create(message: self.company.name + " has invited you to add into their bench, <a href='http://#{self.recipient.etyme_url + job_invitation_path(self)}'> click here</a> to accept or reject. <br/> <p> #{self.message} </p>", title: "Add To Bench Invitation",createable: created_by)

    elsif self.recipient_type == "Company"
          self.sender.notifications.create(message: self.company.name + " has invited you for <a href='http://#{self.recipient.etyme_url + job_invitation_path(self)}'>#{self.job&.title}</a> <br/> <p> #{self.message} </p>", title: "Job Invitation",createable: created_by)

          self.sender.notifications.create(message: self.company.name + " has invited you to add into their bench, <a href='http://#{self.sender.etyme_url + job_invitation_path(self)}'> click here</a> to accept or reject. <br/> <p> #{self.message} </p>", title: "Add To Bench Invitation",createable: created_by)
    else
      self.recipient.notifications.create(message: self.company.name + " has invited you for <a href='http://#{self.recipient.company.etyme_url + job_invitation_path(self)}'>#{self.job.title}</a>", title: "Job Invitation",createable: created_by)

    end

  end

  # Call after update
  def notify_on_status_change
    if self.recipient_type == "Candidate"
      if self.job?
        self.recipient.notifications.create(message: self.recipient.full_name+ " Job Status has been changed to "+ self.status+" <a href='http://#{self.recipient.etyme_url + job_invitation_path(self)}'>#{self.job&.title}</a> <br/> <p> #{self.message} </p>", title: "Job Invitation",createable: created_by)

      end
      if self.bench?
        self.recipient.notifications.create(message: self.recipient.full_name + " Bench Job Invitation Status has been changed to "+ self.status+" <a href='http://#{self.recipient.etyme_url + job_invitation_path(self)}'>#{self.job&.title}</a> <br/> <p> #{self.message} </p>", title: "Job Invitation",createable: created_by)

      end
    else
      if self.job?
        self.recipient.notifications.create(message:  self.recipient.name+ " has " + self.status + " your request for <a href='http://#{self.created_by.company.etyme_url + job_invitation_path(self)}'>invitation</a>", title: "Job Invitation")

      end
      if self.bench?
        self.recipient.notifications.create(message:  self.recipient.name+ " has " + self.status + " your request for <a href='http://#{self.created_by.company.etyme_url + job_invitation_path(self)}'>invitation</a>", title: "Job Invitation")

      end
    end
  end

  def associate_invitation_with_candidate
    candidate = Candidate.where(email: self.email).first || []
    if candidate.present?
      self.recipient_id = candidate.id
      self.recipient_type = "Candidate"
      candidate.invite! do |u|
        u.skip_invitation = true
      end
    else
      self.recipient = Candidate.invite!({first_name: first_name, last_name: last_name, email: email}, self.created_by) do |u|
        u.skip_invitation = true
        # 28 / 02 / 2017
      end
      # self.recipient.sent_invitation_mail
      # self.recipient = Candidate.new({first_name: first_name, last_name: last_name, email: email , invited_by_id: self.created_by.id , invited_by_type: 'User'})
    end
    self.save
    # self.recipient.save
  end
end
