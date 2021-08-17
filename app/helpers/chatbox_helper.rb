# frozen_string_literal: true

module ChatboxHelper
  def mini_chat_title(conversation)
    if conversation.job.present?
      snake_to_words(conversation.job.status).to_s
    elsif conversation.job_application.present?
      link_to snake_to_words(conversation.job_application.status), '#', data: { toggle: 'modal', target: "#Chat_links-#{conversation.job_application.id}" }, style: 'color:white;'
    elsif conversation.sell_contract.present?
      'SellContract'
    elsif conversation.buy_contract.present?
      'BuyContract'
    elsif conversation.porposal_chat_id.present?
      'Proposal'
    else
      'Personal'
    end
  end

  def set_company_chat_user_data(current_chat_user, user)
    conversation = Conversation.where(chatable: user).first
    message = conversation.conversation_messages.order('created_at DESC').first if conversation.present?

    class_name = ''
    last_msg = ''
    last_msg_time = ''
    unread_count = ''

    if message.present?
      class_name = 'unread' unless message.is_read
      # unread_count = ConversationMessage.unread_messages(user, current_user).count
      last_msg = message.body[0..50]
      last_msg_time = time_ago_in_words(message.created_at)
    end
    class_name = 'active' if current_chat_user == user

    {
      class_name: class_name,
      last_msg: last_msg,
      last_msg_time: last_msg_time,
      unread_count: unread_count
    }
  end

  def set_candidate_chat_user_data(current_chat_user, user)
    conversation = Conversation.where(chatable: user).first
    message = conversation.conversation_messages.order('created_at DESC').first if conversation.present?

    class_name = ''
    last_msg = ''
    last_msg_time = ''
    unread_count = ''

    if message.present?
      class_name = 'unread' unless message.is_read
      # unread_count = ConversationMessage.unread_messages(user, current_candidate).count
      last_msg = message.body[0..50]
      last_msg_time = time_ago_in_words(message.created_at)
    end
    class_name = 'active' if current_chat_user == user

    {
      class_name: class_name,
      last_msg: last_msg,
      last_msg_time: last_msg_time,
      unread_count: unread_count
    }
  end

  def get_conversation_title(conversation)
    if conversation.present?
      if conversation.chatable.present?
        if conversation.chatable_type == 'Group'
          conversation.chatable.group_name
        elsif conversation.chatable_type == 'Job'
          conversation.chatable.title + ' (' + (conversation.senderable == current_user ? conversation.recipientable.full_name : conversation.senderable.full_name) + ' )'
        else
          ''
        end
      elsif conversation.senderable == current_user
        conversation.recipientable.full_name
      else
        conversation.senderable.full_name
      end
    else
      ''
    end
  end

  def interlocutor(conversation)
    get_current_user == conversation.recipientable ? conversation.senderable : conversation.recipientable
  end

  def get_current_user
    if current_user.present?
      current_user
    elsif current_candidate.present?
      current_candidate
    end
  end

  def get_contract(usr)
    contract = nil
    if usr.group_name.present?
      if usr.group_name.include? "BC"
        contract = BuyContract.where(number: usr.group_name).first&.contract
      else
        if usr.group_name.include? "SC"
          contract = SellContract.where(number: usr.group_name).first&.contract
        end
      end
    end
    contract
  end

  def get_conversation_link(usr)
    link = nil
    if usr&.group_name.present?
      if usr.group_name.include? "BC"
        obj = BuyContract.where(number: usr.group_name).first&.contract
        link = contract_path(obj)
      elsif usr.group_name.include? "SC"
        obj = SellContract.where(number: usr.group_name).first&.contract
        link = contract_path(obj)
      elsif usr.group_name.include? "J"
        if params[:conversation].present?
          conv = Conversation.find params[:conversation]
          obj = conv.job
          link = job_path(obj)
        end
      else
        link = nil
      end
    end
    link
  end


end
