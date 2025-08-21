# frozen_string_literal: true

# == Schema Information
#
# Table name: document_signs
#
#  id                :bigint           not null, primary key
#  documentable_type :string
#  documentable_id   :bigint
#  signable_type     :string
#  signable_id       :bigint
#  is_sign_done      :boolean          default(FALSE)
#  sign_time         :datetime
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  company_id        :bigint
#  envelope_id       :string
#  envelope_uri      :string
#  signed_file       :string
#  initiator_type    :string
#  initiator_id      :bigint
#  part_of_type      :string
#  part_of_id        :integer
#  requested_by_type :string
#  requested_by_id   :bigint
#  signers_ids       :string           default([]), is an Array
#  save_doc_type     :string
#  save_doc_id       :bigint
#
class DocumentSign < ApplicationRecord
  belongs_to :documentable, polymorphic: :true, optional: true
  belongs_to :signable, polymorphic: :true, optional: true
  belongs_to :initiator, polymorphic: :true, optional: true
  belongs_to :part_of, polymorphic: true, optional: true
  belongs_to :company
  belongs_to :save_doc, polymorphic: true, optional: true
  belongs_to :requested_by, polymorphic: true

  after_create :notify_signable
  after_update :notify_creator

  def get_requester_signer_conversation
    conversation = part_of.is_a?(Conversation) ? part_of : Conversation.DocumentRequest.where(chatable: requested_by.groups.chat_groups.where(id: signable.groups.chat_groups)).first
    conversation.present? ? conversation : create_requester_signer_conversation
  end

  def is_signable?
    documentable.is_require == 'E-Signature'
  end

  def signers
    part_of.class.to_s == 'SellContract' ? part_of.company.users.where(id: signers_ids) : company.users.where(id: signers_ids)
  end

  private

  def notify_signable
    notification = Notification.new(notifiable: signable,
                                    createable: requested_by,
                                    status: :unread, notification_type: :document_request)
    if documentable.is_require == 'E-Signature'
      notification.title = 'Signature Request'
      notification.message = "#{requested_by.full_name.capitalize} has requested you to sign the document sent through docusign"
    else
      notification.title = 'Document Request'
      notification.message = "#{requested_by.full_name.capitalize} has requested you to Submit a #{documentable.is_require} #{"named '#{documentable.title.capitalize}'" if documentable.title.present?}"
    end
    requested_by.conversation_messages.create(conversation_id: conversation_id, body: notification.message, message_type: :DocumentRequest) if notification.save
  end

  def notify_creator
    return unless signed_file.present?

    notification = Notification.new(notifiable: requested_by,
                                    createable: signable,
                                    status: :unread, notification_type: :document_request)
    if documentable.is_require == 'E-Signature'
      notification.title = 'Document Signed'
      notification.message = "#{signable.full_name.capitalize} has signed the document received through docusign"
    else
      notification.title = 'Document Submitted'
      notification.message = "#{signable.full_name.capitalize} has uploaded a #{documentable.is_require} #{"titled '#{documentable.title.capitalize}'" if documentable.title.present?}"
    end
    signable.conversation_messages.create(conversation_id: conversation_id, body: notification.message, message_type: :DocumentRequest) if notification.save
  end

  def conversation_id
    %w[JobApplication BuyContract SellContract].include?(part_of.class.to_s) ? part_of.conversation.id : get_requester_signer_conversation.id
  end

  def create_requester_signer_conversation
    Conversation.create_conversation([signable, requested_by], "D-#{id}", :DocumentRequest, company)
  end
end
