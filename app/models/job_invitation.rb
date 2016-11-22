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

  #Validations

  #Associations
  belongs_to :created_by , class_name: "User" ,foreign_key: :created_by_id
  belongs_to :recipient , polymorphic: true
  belongs_to :job
  belongs_to :user
  has_one :company , through: :job
  has_many :custom_fields ,as: :customizable


  #ClassBacks
  after_create :send_invitation_mail ,:notify_recipient

  private

    def notify_recipient
      self.recipient.create(message: self.company.name+" has invited you for "+self.job.title ,title:"Job Invitation")
    end

    def send_invitation_mail
      JobMailer.send_job_invitation(self).deliver
    end

end
