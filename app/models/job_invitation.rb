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
  has_one :company , through: :job
  has_many :custom_fields ,as: :customizable


  #ClassBacks
  after_create :send_invitation_mail
  after_create :notify_recipient


  #Nested Attributes
  accepts_nested_attributes_for :custom_fields , reject_if: :all_blank

  private

    def notify_recipient
      self.recipient.notifications.create(message: self.company.name+" has invited you for "+self.job.title ,title:"Job Invitation")
    end

    def send_invitation_mail
      JobMailer.send_job_invitation(self).deliver
    end

    # def niti
    #   self.recipient.notifications.create()
    # end
end
