# frozen_string_literal: true

class ConversationMessagesController < ApplicationController
  before_action :set_conversation
  # skip_before_action :authenticate_user!, only: :mark_as_read

  def create
    
    message = ConversationMessage.new(message_params.merge(conversation_id: @conversation.id))
    message.userable = get_current_user
    if message.save
      # current_conversation = message.conversation
      # @conversations = Conversation.send(current_conversation.topic).all_onversations(current_user).paginate(page: params[:page], per_page: 10)
      # @conversations << current_conversation
      # @conversations = @conversations.uniq
      # Construct the base payload once
      payload = {
        msg_id: message.id,
        msg: message.body,
        # Use .try(:first_name) etc. for safety if userable might be nil or not have these methods
        img_alt: "#{message.userable.try(:first_name)&.first&.capitalize || 'N'}.#{message.userable.try(:last_name)&.first&.capitalize || 'A'}",
        sender_name: message.userable.try(:full_name)&.capitalize || "User #{message.userable_id}",
        file_url: message.file_url || '',
        msg_url: message.userable.try(:photo) || '', # Assuming photo method exists
        msg_time: message.created_at.strftime('%l:%M%P'),
        usr_typ: message.userable.class.base_class.name, # Use base_class for consistency (User or Candidate)
        usr: message.userable.id,
        con_id: @conversation.id,
        dom: "#conversation_#{@conversation.id}"
        # unread_msg_cnt should ideally be handled client-side or calculated per recipient if possible here
      }

      recipients_to_notify = Set.new # Use a Set to store {type: 'User'/'Candidate', id: X} to ensure uniqueness

      # Handle group chats
      if @conversation.chatable.is_a?(Group) && @conversation.chatable.groupables.any?
        payload[:chat_typ] = 'Group' # Add chat_typ to payload
        payload[:grp_id] = @conversation.chatable_id

        @conversation.chatable.groupables.each do |groupable_member|
          # Ensure groupable_member.groupable is the actual User/Candidate object
          actual_member = groupable_member.groupable
          if actual_member && (actual_member.is_a?(User) || actual_member.is_a?(Candidate))
            # Don't notify the message sender
            next if actual_member == message.userable
            recipients_to_notify.add({ type: actual_member.class.base_class.name, id: actual_member.id })
          end
        end
      end

      # Handle 1-on-1 chats (senderable/recipientable)
      # This ensures direct participants are added, especially if not a group or if they aren't in groupables for some reason
      # The message.userable is the sender.
      parties_to_consider = []
      parties_to_consider << @conversation.senderable if @conversation.senderable.present?
      parties_to_consider << @conversation.recipientable if @conversation.recipientable.present?

      parties_to_consider.each do |party|
        if party && (party.is_a?(User) || party.is_a?(Candidate))
          # Don't notify the message sender
          next if party == message.userable
          # Add to recipients if not already covered by group logic or if it's explicitly a 1-to-1 chat.
          # For simplicity, we add them here; the Set will handle uniqueness.
          # If it was a group chat, they might already be added. If 1-to-1, this is their primary notification.
          recipients_to_notify.add({ type: party.class.base_class.name, id: party.id })
          
          # If this loop determines it's more of a 1-to-1 context (e.g. no group, or topic is OneToOne)
          # you might set payload[:chat_typ] = 'OneToOne' if not already 'Group'.
          # This part might need refinement based on how `topic` is used vs `chatable`.
          # For now, if it's not explicitly a group, let's assume it could be 1-to-1.
          if !@conversation.chatable.is_a?(Group)
             payload[:chat_typ] ||= @conversation.topic == 'OneToOne' ? 'OneToOne' : 'Chat' # Fallback to 'Chat'
          end

        end
      end
      
      # Broadcast to all unique recipients
      recipients_to_notify.each do |recipient|
        # Stream name on client side is "Message_User_X" or "Message_Candidate_X"
        # Admin users (Admin < User) subscribe as "User"
        stream_type_for_channel = recipient[:type] # Should be "User" or "Candidate" from base_class.name
        stream_name = "Message_#{stream_type_for_channel}_#{recipient[:id]}"
        
        # Copy base payload and add recipient-specific info if any
        recipient_payload = payload.merge(recpt_type: recipient[:type], recpt_id: recipient[:id])
        ActionCable.server.broadcast stream_name, recipient_payload
      end
    end
    head :ok
  end

  def mark_as_read
    if params[:chat_type] == 'Group'
      GroupMsgNotify.where(conversation_message_id: params[:id], group_id: params[:group_id],
                           member_type: params[:cnt_user_type], member_id: params[:cnt_user_id]).update_all(is_read: true)
    else
      ConversationMessage.where(conversation_id: params[:conversation_id], id: params[:id]).update_all(is_read: true)
    end
    render json: :ok
  end

  def messages
    if params[:search_message_query].present?
      @prev_date = params[:prev_date] ||= nil
      @messages = @conversation.conversation_messages.where("body LIKE ?", "%" + params[:search_message_query] + "%").paginate(page: params[:page], per_page: 10)
    else
      @prev_date = params[:prev_date] ||= nil
      @messages = @conversation.conversation_messages.order(created_at: :desc).paginate(page: params[:page], per_page: 10) if @conversation.present?
    end
    
  end

  def pop_messages
    @prev_date  = params[:prev_date] ||= nil
    @messages   = []
    @messages   = @conversation.conversation_messages.order(created_at: :desc).paginate(page: params[:page], per_page: 10) unless @conversation.nil?
  end

  private

  def set_conversation
    @conversation = Conversation.where(id: params[:conversation_id]).first
  end

  def message_params
    params.require(:conversation_message).permit(:body, :attachment_file, :file_name, :file_size, :file_type, :file_url)
  end

  def render_message(message)
    render(partial: 'conversation_messages/conversation_message', locals: { message: message })
  end

  def get_current_user
    if current_user.present?
      current_user
    elsif current_candidate.present?
      current_candidate
    end
  end
end
