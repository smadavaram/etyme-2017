class DocumentSign < ApplicationRecord
  belongs_to :documentable, polymorphic: :true, optional: true
  belongs_to :signable, polymorphic: :true, optional: true
  belongs_to :initiator, polymorphic: :true, optional: true
  belongs_to :part_of, polymorphic: true, optional: true
  belongs_to :company

  after_create :notify_signable
  after_update :notify_creator

  private

  def notify_signable
    notification = Notification.new(notifiable: signable,
                                    createable: part_of.contract.created_by,
                                    status: :unread, notification_type: :contract)
    if documentable.is_require == "signature"
      notification.title = "Signature Request"
      notification.message = "#{part_of.contract.created_by.full_name.capitalize} has requested you to sign the document sent through docusign"
    else
      notification.title = "Document Request"
      notification.message = "#{part_of.contract.created_by.full_name.capitalize} has requested you to Submit a document #{ "titled '#{documentable.title.capitalize}'" if documentable.title.present?}"
    end
    notification.save
  end

  def notify_creator
    if signed_file.present?
      notification = Notification.new(notifiable: part_of.contract.created_by,
                                      createable: signable,
                                      status: :unread, notification_type: :contract)
      if documentable.is_require == "signature"
        notification.title = "Document Signatured"
        notification.message = "#{signable.full_name.capitalize} has signed the document received through docusign"
      else
        notification.title = "Document Submitted"
        notification.message = "#{signable.full_name.capitalize} has uploaded a document #{"titled '#{documentable.title.capitalize}'" if documentable.title.present? }"
      end
      notification.save
    end
  end

end
