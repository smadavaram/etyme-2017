# require 'google-apis-indexing_v3'

module GoogleJobs

  TYPES = {
    URL_UPDATED: "URL_UPDATED",
    URL_DELETED: "URL_DELETED",
    URL_ADDED: "URL_ADDED",

  }

  LOGGER = Logger.new('log/google_jobs.log')

  # def indexing
  #
  # end

  def update_google_job(url:, type: TYPES[:URL_UPDATED])
    scopes = [Google::Apis::IndexingV3::AUTH_INDEXING]
    indexing = Google::Apis::IndexingV3::IndexingService.new
    indexing.authorization = Google::Auth::ServiceAccountCredentials.make_creds(
      json_key_io: File.open('etyme-263016-eb89ccc549c2.json'),
      scope: scopes)

    indexing.authorization.fetch_access_token!

    # eg: https://cloudepa.etyme.com/static/jobs/80
    update = Google::Apis::IndexingV3::UrlNotification
               .new(url:'https://cloudepa.etyme.com/static/jobs/81', type: type)
    begin
      u = indexing.publish_url_notification(update)
      LOGGER.info "Google job updated: #{u}"
    rescue Google::Apis::ClientError => e
      LOGGER.error e
    end
  end

  def get_google_job(url:)
    scopes = [Google::Apis::IndexingV3::AUTH_INDEXING]
    indexing = Google::Apis::IndexingV3::IndexingService.new
    indexing.authorization = Google::Auth::ServiceAccountCredentials.make_creds(
      json_key_io: File.open('etyme-263016-eb89ccc549c2.json'),
      scope: scopes)

    indexing.authorization.fetch_access_token!
    begin
      index = indexing.get_url_notification_metadata(url)
      LOGGER.info "Google job: #{index}"
    rescue Google::Apis::ClientError => e
      LOGGER.error e
    end
  end

end
