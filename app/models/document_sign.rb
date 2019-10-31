class DocumentSign < ApplicationRecord

  belongs_to :documentable, polymorphic: :true, optional: true
  belongs_to :signable, polymorphic: :true, optional: true
  belongs_to :initiator, polymorphic: :true, optional: true
  belongs_to :part_of, polymorphic: true, optional: true
  belongs_to :company
  belongs_to :requested_by, polymorphic: true


  after_create :notify_signable
  after_update :notify_creator

  def get_requester_signer_conversation
    conversation = part_of.is_a?(Conversation) ? part_of : Conversation.DocumentRequest.where(chatable: requested_by.groups.chat_groups.where(id: signable.groups.chat_groups)).first
    conversation.present? ? conversation : create_requester_signer_conversation
  end

  def is_signable?
    documentable.is_require == "signature"
  end

  def signers
    part_of.class.to_s == "SellContract" ? part_of.company.users.where(id: signers_ids) : company.users.where(id: signers_ids)
  end

  private

  def notify_signable
    notification = Notification.new(notifiable: signable,
                                    createable: requested_by,
                                    status: :unread, notification_type: :document_request)
    if documentable.is_require == "signature"
      notification.title = "Signature Request"
      notification.message = "#{requested_by.full_name.capitalize} has requested you to sign the document sent through docusign"
    else
      notification.title = "Document Request"
      notification.message = "#{requested_by.full_name.capitalize} has requested you to Submit a #{documentable.is_require} #{ "named '#{documentable.title.capitalize}'" if documentable.title.present?}"
    end
    if notification.save
      requested_by.conversation_messages.create(conversation_id: conversation_id, body: notification.message, message_type: :DocumentRequest)
    end
  end

  def notify_creator
    if signed_file.present?
      notification = Notification.new(notifiable: requested_by,
                                      createable: signable,
                                      status: :unread, notification_type: :document_request)
      if documentable.is_require == "signature"
        notification.title = "Document Signatured"
        notification.message = "#{signable.full_name.capitalize} has signed the document received through docusign"
      else
        notification.title = "Document Submitted"
        notification.message = "#{signable.full_name.capitalize} has uploaded a #{documentable.is_require} #{"titled '#{documentable.title.capitalize}'" if documentable.title.present? }"
      end
      if notification.save
        signable.conversation_messages.create(conversation_id: conversation_id, body: notification.message, message_type: :DocumentRequest)
      end
    end
  end

  def conversation_id
    ["JobApplication", "BuyContract", "SellContract"].include?(part_of.class.to_s) ? part_of.conversation.id : get_requester_signer_conversation.id
  end

  def create_requester_signer_conversation
    Conversation.create_conversation([signable, requested_by], "D-#{id}", :DocumentRequest, company)
  end

end
