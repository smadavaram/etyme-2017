# require 'google-apis-indexing_v3'

module GoogleJobs
  def auth
    scopes = ['https://www.googleapis.com/auth/indexing']
    authorizer = Google::Auth::ServiceAccountCredentials.make_creds(
      json_key_io: File.open(Rails.root + 'etyme-263016-eb89ccc549c2.json'),
      scope: scopes)
    authorizer.fetch_access_token!
  end

  def get_auth
    auth
  end


end
