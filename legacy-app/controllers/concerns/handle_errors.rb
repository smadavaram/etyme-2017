module  HandleErrors

  def handle_email_errors(&block)
    begin
      yield
    rescue Net::SMTPAuthenticationError, Net::SMTPServerBusy, Net::SMTPSyntaxError, Net::SMTPFatalError, Net::SMTPUnknownError, StandardError => e
      p e
    end
  end

end