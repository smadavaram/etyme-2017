class Candidate::MessagesController < Candidate::BaseController
  before_action :find_chat , only:  [:create,:file_message , :render_message,:share_message]
  before_action :find_message  ,only:  [:render_message, :share_message]

  def create
    @message = @chat.messages.new(message_params.merge(messageable: current_candidate))
    respond_to  do |format|
      format.js do
        if @message.save
          flash[:success] = "Message sent successfully"
        else
          flash[:errors] = @message.errors.full_messages
        end
      end
    end
  end

  def render_message
    respond_to do |format|
      format.js

    end
  end

  def file_message
    respond_to do |format|
      format.js  do
        if(params[:message_id].present?)
          @parent_message = Message.find(params[:message_id])
          @parent_message.signed_uploaded!
          @attachment = @parent_message.try(:company_doc).try(:attachment)
          body = "#{current_candidate.try(:full_name)} uploaded signed copy of file <a href=#{@attachment.try(:file) } download>#{@parent_message.try(:company_doc).try(:name)}</a> with signed file <a href=#{params[:file_url]} download>#{params[:file_name]}</a>"
        else
          body = "#{current_candidate.try(:full_name)} uploaded a file with name <a href=#{params[:file_url]} download>#{params[:file_name]}</a>"
        end
        @message = @chat.messages.new(messageable: current_candidate ,body: body)
        if @message.save()
          flash[:success] = "Message sent successfully"

        else
          flash[:errors] = @message.errors.full_messages
        end
      end
    end
  end
  def share_message
    if request.post?
      UserMailer.share_message_email(@message, params[:email] ,params[:note]).deliver
      flash[:success] = "Message Shared Successfully."
      redirect_back fallback_location: root_path
    end
  end

  private

  def message_params
    params.require(:message).permit(:body ,:messageable_id ,:messageable_type,:chat_id)
  end

  def find_chat
    @chat = current_candidate.chats.find( params[:chat_id] || params[:message][:chat_id] ) || []
  end

  def find_message
    @message = @chat.messages.find(params[:id] || params[:message_id]) || []
  end
end
