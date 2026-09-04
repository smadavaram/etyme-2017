# frozen_string_literal: true

class Candidate::ChatsController < Candidate::BaseController
  before_action :find_chat, only: [:show]

  def show
    @messages = @chat.try(:messages)
  end

  private

  def find_chat
    @chats = current_candidate.try(:chats)
    @chat = current_candidate.chats.find(params[:id] || params[:chat_id]) || []
  end
end
