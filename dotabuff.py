#!/usr/bin/env python
import urllib2
import json
import random
import time
import pprint
from bs4 import BeautifulSoup

def kparse(val):
    mult = 1
    if 'k' in val:
        mult = 1000
        val = val.replace('k', '')
    return float(val)*mult

def parse_player(player):
    cols = player.find_all('td')
    data = {}
    data['name'] = cols[1].get_text()
    data['dota_id'] = None
    if cols[1].find_all('a'):
        data['dota_id'] = int(cols[1].find_all('a')[0].get('href').split('/')[-1])
    data['level'] = int(cols[3].get_text())
    data['kills'] = int(cols[4].get_text())
    data['deaths'] = int(cols[5].get_text())
    data['assists'] = int(cols[6].get_text())
    data['gold'] = kparse(cols[7].get_text())
    data['last hits'] = int(cols[8].get_text())
    data['denies'] = int(cols[9].get_text())
    data['xpm'] = kparse(cols[10].get_text())
    data['gpm'] = kparse(cols[11].get_text())
    data['hero damage'] = kparse(cols[12].get_text())
    data['hero healing'] = kparse(cols[13].get_text())
    data['tower damage'] = kparse(cols[14].get_text())
    data['kda'] = (data['kills'] + data['assists']) / float(max(data['deaths'],1))
    data['kd'] = data['kills'] / float(max(data['deaths'],1))
    return data


def identified_players(team, dota_to_mumble):
    return {dota_to_mumble[p['dota_id']]: p for p in team
            if p['dota_id'] in dota_to_mumble}

TEAM_RATIOS = ['xpm', 'gpm', 'tower damage', 'hero damage']
KDASCALE = 1.0/4
TDSCALE = 0.5

def read_stats(dire, radiant, winner, playermap, debug):
    stats = {}
    dota_to_mumble = {v:k for k,v in playermap.items()}

    keys = dire[0].keys()
    keys.remove('name')
    keys.remove('dota_id')
    stats['dire_sums'] = {k:sum([x[k] for x in dire]) for k in keys}
    stats['radiant_sums'] = {k:sum([x[k] for x in radiant]) for k in keys}

    id_dire = identified_players(dire, dota_to_mumble)
    id_radiant = identified_players(radiant, dota_to_mumble)
    if len(id_dire) == len(id_radiant) == 0:
        print id_dire
        print 'no stats'
        return stats
    elif len(id_dire) < len(id_radiant):
        players = id_radiant
        player_team = radiant
        other_team = dire
        stats['team'] = 'radiant'
        player_sums = stats['radiant_sums']
        other_sums = stats['dire_sums']
        stats['identified'] = id_radiant
    else:
        players = id_dire
        player_team = dire
        other_team = radiant
        stats['team'] = 'dire'
        player_sums = stats['dire_sums']
        other_sums = stats['radiant_sums']
        stats['identified'] = id_dire

    worst_kda = (1000, 'none')
    worst_kd = (1000, 'none')
    best_kda = (-1, 'none')
    best_kd = (-1, 'none')
    for player in stats['identified'].values():
        if worst_kda[0] > player['kda']:
            worst_kda = (player['kda'], player)
        if worst_kd[0] > player['kd']:
            worst_kd = (player['kd'], player)
        if best_kda[0] < player['kda']:
            best_kda = (player['kda'], player)
        if best_kd[0] < player['kd']:
            best_kd = (player['kd'], player)
    stats['best_kda'] = best_kda
    stats['best_kd'] = best_kd
    stats['worst_kda'] = worst_kda
    stats['worst_kd'] = worst_kd

    stats['carry'] = None

    player_means = {k: v/5.0 for k,v in stats['dire_sums'].items()}
    player_diffs = []
    for player in player_team:
        player_diffs.append({k:(player[k] - player_means[k]) for k in keys})

    diff_sums = {k:max(abs(p[k]) for p in player_diffs) for k in keys}
    for p in player_diffs:
        for k in keys:
            p[k] /= max(diff_sums[k],1)

    stats['player_diffs'] = player_diffs
    if debug:
        print 'means', player_means
        pprint.pprint({player_team[i]['name']:d for i,d in enumerate(player_diffs)})

    roles = {
        'farmer': (-1, None),
        'carry': (-1, None),
        'feeder': (-1, None),
        'ganker': (-1, None),
        'pusher': (-1, None)
    }
    for i, diffs in enumerate(player_diffs):
        player = player_team[i]
        score = diffs['tower damage'] / diffs['hero damage']
        if roles['pusher'][0] < score:
            roles['pusher'] = (score, player)

        score = diffs['last hits'] / diffs['hero damage']
        if roles['farmer'][0] < score:
            roles['farmer'] = (score, player)

        score = diffs['kda'] / diffs['tower damage']
        if debug:
            print player['name'], diffs['kda'], diffs['tower damage'], score
        if roles['ganker'][0] < score:
            roles['ganker'] = (score, player)


        score = 1-diffs['kda']
        if roles['feeder'][0] < score:
            roles['feeder'] = (score, player)

        score = (diffs['kda'] + diffs['hero damage'])/2
        if roles['carry'][0] < score:
            roles['carry'] = (score, player)

    roles = {k:v for k,v in roles.items() if v[1]}
    if debug:
        print {k:(v[0], v[1]['name']) for k,v in roles.items()}
    # just the top 3
    roles = {k:v for k,v in sorted(roles.items(), key=lambda x: x[1][1])[-3:]}
    stats['roles'] = roles


    for stat in TEAM_RATIOS:
        stats[stat+'_ratio'] = player_sums[stat] / max(other_sums[stat], 1)

    stats['tower damage_ratio'] *= TDSCALE

    best_stat = (0, 'none')
    worst_stat = (100000000, 'none')
    for stat in TEAM_RATIOS:
        if best_stat[0] < stats[stat+'_ratio']:
            best_stat = (stats[stat+'_ratio'], stat)
        if worst_stat[0] > stats[stat+'_ratio']:
            worst_stat = (stats[stat+'_ratio'], stat)
    stats['best_ratio'] = best_stat
    stats['worst_ratio'] = worst_stat

    if 'radiant' in winner.lower() and player_team != radiant:
        stats['win'] = False
    elif 'dire' in winner.lower() and player_team != dire:
        stats['win'] = False
    else:
        stats['win'] = True

    team_sums = stats[stats['team'] + '_sums']

    return stats

def make_commentary(stats, playermap, debug):
    commentary = []
    dota_to_mumble = {v:k for k,v in playermap.items()}

    def get_name(dota_dict):
        if dota_dict == 'none':
            return 'none'
        if dota_dict['dota_id'] in dota_to_mumble:
            return dota_to_mumble[dota_dict['dota_id']]
        else:
            return 'a pub'

    commentary.append((1.0-stats['worst_ratio'][0],
                       'Your ' + stats['worst_ratio'][1] + ' is terrible!'))
    commentary.append((stats['best_ratio'][0],
                       'Pretty good ' + stats['best_ratio'][1]))

    best_kda_name = dota_to_mumble[stats['best_kda'][1]['dota_id']]
    worst_kda_name = dota_to_mumble[stats['worst_kda'][1]['dota_id']]

    if stats['win']:
        commentary.append((0.2, 'Wow, you won?'))

        for role, data in stats['roles'].items():
            name = get_name(data[1])
            if role == 'carry':
                commentary.append((data[0], '{0} carried the team.'.format(name)))
            if role == 'feeder':
                commentary.append((data[0], '{0}\'s feeding didn\'t exactly help.'.format(name)))
            if role == 'ganker':
                commentary.append((data[0], '{0} just ganked the entire time.'.format(name)))
            if role == 'farmer':
                commentary.append((data[0], '{0} just farmed all game.'.format(name)))
            if role == 'pusher':
                commentary.append((data[0], '{0} pushed all their towers in.'.format(name)))
    else:
        commentary.append((0.2, 'You lost!'))

        for role, data in stats['roles'].items():
            name = get_name(data[1])
            if role == 'carry':
                commentary.append((data[0], '{0} carried you losers.'.format(name)))
            if role == 'feeder':
                commentary.append((data[0], '{0} fed really hard.'.format(name)))
            if role == 'ganker':
                commentary.append((data[0], '{0} just ganked the entire time.'.format(name)))
            if role == 'farmer':
                commentary.append((data[0], '{0} didn\'t notice the loss because they were too busy farming.'.format(name)))
            if role == 'pusher':
                commentary.append((data[0], '{0} wasted the whole game trying to push.'.format(name)))

    return commentary


def examine(url, playermap, debug):
    url = 'http://www.dotabuff.com/matches/' + url
    page = urllib2.urlopen(url).read()
    soup = BeautifulSoup(page)

    winner = soup.find_all("div", class_="match-result")[0].get_text()

    dire = soup.find_all('tr', class_='faction-dire')
    dire_players = [parse_player(x) for x in dire]
    radiant = soup.find_all('tr', class_='faction-radiant')
    radiant_players = [parse_player(x) for x in radiant]

    stats = read_stats(dire_players, radiant_players, winner, playermap, debug)

    commentary = make_commentary(stats, playermap, debug)
    if debug:
        print commentary
    chosen = sorted(commentary, key=lambda x:x[0])[-3:]
    if debug:
        print 'narrowed to', chosen

    chosen = random.choice(chosen)[1]

    return chosen


if __name__=='__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('url')
    parser.add_argument('playermap')
    parser.add_argument('--debug', dest='debug', action='store_true', default=False)
    args = parser.parse_args()
    random.seed(time.time())
    print examine(args.url, json.loads(args.playermap), args.debug)

