class DocumentSign < ApplicationRecord

  delegate :url_helpers, to: 'Rails.application.routes'

  belongs_to :documentable, polymorphic: :true, optional: true
  belongs_to :signable, polymorphic: :true, optional: true
  belongs_to :initiator, polymorphic: :true, optional: true
  belongs_to :part_of, polymorphic: true, optional: true
  belongs_to :company
  belongs_to :requested_by, polymorphic: true


  after_save :notify_signable
  after_create :notify_document_request
  after_update :notify_creator

  def get_requester_signer_conversation
    conversation = part_of.is_a?(Conversation) ? part_of : Conversation.DocumentRequest.where(chatable: requested_by.groups.chat_groups.where(id: signable.groups.chat_groups)).first
    conversation.present? ? conversation : create_requester_signer_conversation
  end

  def signers
    company.users.where(id: signers_ids)
  end

  private

  def create_requester_signer_conversation
    Conversation.create_conversation([signable, requested_by], "D-#{id}", :DocumentRequest, company)
  end

  def notify_document_request
    if documentable.is_require != "signature"
      notification = Notification.new(notifiable: signable,
                                      createable: requested_by,
                                      status: :unread, notification_type: part_of.class.to_s.tableize.singularize)
      notification.title = "Document Request"
      notification.message = "#{requested_by.full_name.capitalize} has requested you to Submit a document #{ "titled '#{documentable.title.capitalize}'" if documentable.title.present?}"
      chat_message = notification.message
      if notification.save
        conversation_id = part_of.class.to_s == "JobApplication" ? part_of.conversation.id : get_requester_signer_conversation.id
        requested_by.conversation_messages.create(conversation_id: conversation_id, body: chat_message, message_type: :DocumentRequest)
      end
    end
  end

  def notify_signable
    notification = Notification.new(notifiable: signable,
                                    createable: requested_by,
                                    status: :unread, notification_type: part_of.class.to_s.tableize.singularize)
    if documentable.is_require == "signature" and envelope_id.present?
      notification.title = "Signature Request"
      notification.message = "#{requested_by.full_name.capitalize} has requested you to sign the document sent through docusign"
      chat_message = "#{notification.message}. #{ActionController::Base.helpers.link_to 'Open Document', url_helpers.company_document_sign_open_envelope_path(self)}"
      if notification.save
        conversation_id = part_of.class.to_s == "JobApplication" ? part_of.conversation.id : get_requester_signer_conversation.id
        requested_by.conversation_messages.create(conversation_id: conversation_id, body: chat_message, message_type: :DocumentRequest)
      end
    end
  end

  def notify_creator
    if signed_file.present?
      notification = Notification.new(notifiable: requested_by,
                                      createable: signable,
                                      status: :unread, notification_type: part_of.class.to_s.tableize.singularize)
      if documentable.is_require == "signature"
        notification.title = "Document Signatured"
        notification.message = "#{signable.full_name.capitalize} has signed the document received through docusign"
        chat_message = "#{notification.message}. #{ActionController::Base.helpers.link_to 'Open Document', url_helpers.company_document_sign_open_envelope_path(self)}"
      else
        notification.title = "Document Submitted"
        notification.message = "#{signable.full_name.capitalize} has uploaded a document #{"titled '#{documentable.title.capitalize}'" if documentable.title.present? }"
        chat_message = notification.message
      end
      if notification.save
        conversation_id = part_of.class.to_s == "JobApplication" ? part_of.conversation.id : get_requester_signer_conversation.id
        signable.conversation_messages.create(conversation_id: conversation_id, body: chat_message, message_type: :DocumentRequest)
      end
    end
  end
end
