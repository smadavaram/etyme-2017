# frozen_string_literal: true

require 'omniauth-oauth2'

module OmniAuth
  module Strategies
    class Zoom < OmniAuth::Strategies::OAuth2
      option :name, 'zoom'

      def client
        options.client_options.site = 'https://zoom.us'
        options.client_options.authorize_url = "#{options.oauth_base_uri}/oauth/authorize"
        options.client_options.token_url = "#{options.oauth_base_uri}/oauth/token"
        super
      end

      uid { raw_info['id'] }

      info do
        { user: user }
      end

      extra do
        { raw_info: raw_info, user: user }
      end

      def raw_info
        @raw_info ||= access_token.get('v2/users/me').parsed
      end

      def user
        @user ||= {
          first_name: raw_info['first_name'],
          last_name: raw_info['last_name'],
          email: raw_info['email']
        }
      end
    end
  end
end
